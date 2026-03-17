import { logger } from "../../utils/logger";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import axios from "axios";
import saveMediaToFile from "../../helpers/saveMediaFile";

const GRAPH_API_URL = "https://graph.facebook.com/v25.0";
const SENDER_NAME_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const senderNameCache = new Map<string, { name: string; expiresAt: number }>();

async function resolveInstagramSenderName(
  senderId: string,
  accessToken?: string | null
): Promise<string | null> {
  if (!senderId || !accessToken) return null;

  const cached = senderNameCache.get(senderId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.name;
  }

  try {
    const response = await axios.get(`${GRAPH_API_URL}/${senderId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      params: {
        fields: "username,name"
      }
    });

    const resolved =
      (typeof response.data?.username === "string" && response.data.username.trim()) ||
      (typeof response.data?.name === "string" && response.data.name.trim()) ||
      null;

    if (resolved) {
      senderNameCache.set(senderId, {
        name: resolved,
        expiresAt: Date.now() + SENDER_NAME_CACHE_TTL_MS
      });
    }

    return resolved;
  } catch {
    return null;
  }
}

export async function processInstagramWebhook(
  whatsapp: Whatsapp,
  entry: Record<string, unknown>
): Promise<void> {
  try {
    const messaging: any[] = (entry as any)?.messaging || [];
    const changes: any[] = (entry as any)?.changes || [];

    logger.info(
      {
        whatsappId: whatsapp.id,
        companyId: whatsapp.companyId,
        channel: "instagram",
        messagingCount: messaging.length,
        changesCount: changes.length
      },
      "Instagram: inbound webhook processing started"
    );

    // Combine events for processing
    const events: any[] = [];

    // Process DMs
    for (const msg of messaging) {
      const senderIdRaw = msg?.sender?.id || msg?.from?.id;
      const isEcho = msg?.message?.is_echo === true;
      const recipientId = msg?.recipient?.id;
      const userRef = msg?.sender?.user_ref;
      const senderName =
        msg?.sender?.username || msg?.sender?.name || msg?.from?.username || msg?.from?.name;
      const ownIds = [
        whatsapp.facebookPageUserId,
        whatsapp.instagramBusinessAccountId,
        whatsapp.facebookUserId
      ].filter(Boolean);

      // Em DM do Instagram, para responder corretamente, precisamos persistir SEMPRE o id do interlocutor.
      // Em alguns eventos (echo), sender pode ser nossa própria conta e recipient o interlocutor.
      const participantId =
        (senderIdRaw && !ownIds.includes(senderIdRaw) && senderIdRaw) ||
        (recipientId && !ownIds.includes(recipientId) && recipientId) ||
        senderIdRaw ||
        recipientId ||
        userRef;

      const isSelfSender = Boolean(senderIdRaw && ownIds.includes(senderIdRaw));

      if (!participantId) {
        logger.warn(
          {
            whatsappId: whatsapp.id,
            companyId: whatsapp.companyId,
            channel: "instagram",
            payloadKeys: Object.keys(msg || {}),
            hasMessage: Boolean(msg?.message),
            hasSender: Boolean(msg?.sender),
            hasFrom: Boolean(msg?.from),
            hasRecipient: Boolean(msg?.recipient)
          },
          "Instagram: DM event skipped because senderId is missing"
        );
        continue;
      }

      if (isEcho) {
        if (!isSelfSender) {
          logger.warn(
            {
              whatsappId: whatsapp.id,
              companyId: whatsapp.companyId,
              channel: "instagram",
              senderId: senderIdRaw,
              participantId,
              recipientId,
              msgId: msg?.message?.mid,
              ownIds
            },
            "Instagram: DM received with is_echo=true but sender is not own account; processing as inbound"
          );
        }

        if (isSelfSender) {
          logger.info(
            {
              whatsappId: whatsapp.id,
              companyId: whatsapp.companyId,
              channel: "instagram",
              senderId: senderIdRaw,
              participantId,
              msgId: msg?.message?.mid,
              recipientId,
              ownIds
            },
            "Instagram: DM echo ignored"
          );
          continue;
        }

        logger.info(
          {
            whatsappId: whatsapp.id,
            companyId: whatsapp.companyId,
            channel: "instagram",
            senderId: senderIdRaw,
            participantId,
            msgId: msg?.message?.mid,
            recipientId
          },
          "Instagram: DM echo accepted for processing"
        );
      }

      events.push({
        senderId: participantId,
        senderName,
        isEcho,
        msgId: msg.message?.mid || `ig-dm-${Date.now()}`,
        text: msg.message?.text || "",
        attachments: msg.message?.attachments || [],
        isDeleted: msg.message?.is_deleted
      });
    }

    // Process Comments
    for (const change of changes) {
      if (change.field === "comments" || change.field === "mentions") {
        const value = change.value;
        const senderId = value?.from?.id || value?.user_id;
        if (!senderId) {
          logger.warn(
            {
              whatsappId: whatsapp.id,
              companyId: whatsapp.companyId,
              channel: "instagram",
              field: change.field,
              valueKeys: Object.keys(value || {})
            },
            "Instagram: comment/mention skipped because senderId is missing"
          );
          continue;
        }

        // Ignore our own comments if we can identify them (using whatsapp.facebookPageUserId or similar)
        if (senderId === whatsapp.facebookPageUserId || senderId === whatsapp.instagramBusinessAccountId) continue;

        events.push({
          senderId,
          senderName: value?.from?.username || value?.from?.name || value?.username,
          isEcho: false,
          msgId: value?.id || `ig-c-${Date.now()}`,
          text: value?.text || value?.message || `Instagram ${change.field}`,
          attachments: [], // Comments generally don't have standard messaging attachments here
          isComment: true,
          commentId: value?.id
        });
      }
    }

    if (events.length === 0) {
      logger.warn(
        {
          whatsappId: whatsapp.id,
          companyId: whatsapp.companyId,
          channel: "instagram",
          messagingCount: messaging.length,
          changesCount: changes.length
        },
        "Instagram: no processable events extracted from webhook payload"
      );
    }

    for (const event of events) {
      const { senderId, senderName, isEcho, msgId, text, attachments, isDeleted, isComment } = event;
      if (!senderId) continue;
      if (isEcho) {
        logger.info(
          {
            whatsappId: whatsapp.id,
            companyId: whatsapp.companyId,
            channel: "instagram",
            msgId,
            senderId
          },
          "Instagram: event ignored because isEcho=true"
        );
        continue;
      }

      logger.info(
        {
          whatsappId: whatsapp.id,
          companyId: whatsapp.companyId,
          channel: "instagram",
          senderId,
          msgId,
          isComment: Boolean(isComment),
          hasAttachments: Boolean(attachments?.length),
          isDeleted: Boolean(isDeleted)
        },
        "Instagram: inbound event received"
      );

      const normalizedSenderName =
        typeof senderName === "string" && senderName.trim().length > 0
          ? senderName.trim()
          : null;

      const resolvedSenderName =
        normalizedSenderName ||
        (await resolveInstagramSenderName(senderId, whatsapp.facebookUserToken));

      const fallbackName = `Instagram ${senderId}`;
      const contactName = resolvedSenderName || fallbackName;

      let bodyText: string = text;
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      const MessageModel = require("../../models/Message")
        .default as typeof import("../../models/Message").default;
      const existing = await MessageModel.findOne({ where: { id: msgId } });
      if (existing) {
        logger.info(
          {
            whatsappId: whatsapp.id,
            companyId: whatsapp.companyId,
            channel: "instagram",
            msgId
          },
          "Instagram: duplicate message ignored"
        );
        continue;
      }

      // Find or create contact
      let contact = await Contact.findOne({
        where: { number: senderId, companyId: whatsapp.companyId }
      });
      if (!contact) {
        contact = await Contact.create({
          name: contactName,
          number: senderId,
          email: "",
          companyId: whatsapp.companyId,
          channel: "instagram"
        });
      } else if (
        resolvedSenderName &&
        contact.name !== resolvedSenderName &&
        (contact.name === senderId || contact.name === fallbackName)
      ) {
        await contact.update({ name: resolvedSenderName });
      }

      const { ticket } = await FindOrCreateTicketService(
        contact,
        whatsapp.id,
        whatsapp.companyId,
        { incrementUnread: true }
      );

      if (isDeleted) {
        bodyText = "🚫 _Mensagem apagada_";
      } else if (isComment) {
        bodyText = `💬 [Comentário]: ${bodyText}`;
      } else if (attachments && attachments.length > 0) {
        // ... (rest of media handling logic remains the same)
        const attachment = attachments[0];
        const type = attachment.type;
        const payloadUrl = attachment.payload?.url;

        if (payloadUrl) {
          try {
            const response = await axios.get(payloadUrl, { responseType: "arraybuffer" });
            const buffer = Buffer.from(response.data);
            const mime = response.headers["content-type"] || "application/octet-stream";
            const mimeToExt: Record<string, string> = {
              "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
              "video/mp4": ".mp4", "video/3gpp": ".3gp", "audio/ogg": ".ogg", "audio/mpeg": ".mp3",
              "audio/mp4": ".m4a", "audio/aac": ".aac", "application/pdf": ".pdf",
              "application/msword": ".doc",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
              "application/vnd.ms-excel": ".xls",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
              "application/vnd.ms-powerpoint": ".ppt",
              "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
              "application/zip": ".zip",
              "text/plain": ".txt"
            };
            let ext = mimeToExt[mime.split(";")[0].trim()] || ".bin";
            if (type === "image" && ext === ".bin") ext = ".jpg";
            if (type === "video" && ext === ".bin") ext = ".mp4";
            if (type === "audio" && ext === ".bin") ext = ".ogg";
            const filename = `${Date.now()}_ig_${msgId}${ext}`;
            const media = { data: buffer, mimetype: mime, filename };
            mediaUrl = await saveMediaToFile(media, { destination: ticket });
            const mt = mime.split("/")[0];
            mediaType = ["audio", "video", "image"].includes(mt) ? mt : "document";
            if (!bodyText) bodyText = `📎 [${type}]`;
          } catch (err) {
            logger.error({ err }, "processInstagramWebhook: error downloading media");
            if (!bodyText) bodyText = `📎 [${type}] (Error downloading)`;
          }
        } else if (type === "share") {
          const shareLink = attachment.payload?.link;
          bodyText = bodyText ? `${bodyText}\n${shareLink}` : shareLink;
        } else if (type === "story_mention") {
          const storyLink = attachment.payload?.link;
          bodyText = bodyText ? `Story Mention:\n${bodyText}\n${storyLink}` : `Story Mention:\n${storyLink}`;
        }
      }

      if (!bodyText && !mediaUrl) {
        bodyText = "[sticker/media unsupported]";
      }

      const messageData = {
        id: msgId,
        ticketId: ticket.id,
        contactId: contact.id,
        body: bodyText,
        fromMe: false,
        read: false,
        mediaUrl,
        mediaType,
        ack: 0,
        channel: "instagram"
      };

      await CreateMessageService({ messageData, companyId: whatsapp.companyId });
      logger.info(
        {
          whatsappId: whatsapp.id,
          companyId: whatsapp.companyId,
          channel: "instagram",
          msgId,
          ticketId: ticket.id,
          contactId: contact.id
        },
        "Instagram: message persisted and emitted"
      );
      await ticket.update({ lastMessage: bodyText });

      if (ticket.status === "closed") {
        await UpdateTicketService({
          ticketData: { status: "pending" },
          ticketId: ticket.id,
          companyId: whatsapp.companyId
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "processInstagramWebhook: error");
  }
}
