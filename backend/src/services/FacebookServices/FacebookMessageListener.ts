import { logger } from "../../utils/logger";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import axios from "axios";
import saveMediaToFile from "../../helpers/saveMediaFile";

const GRAPH_API_URL = "https://graph.facebook.com/v25.0";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/3gpp": ".3gp",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx"
};

const ATTACHMENT_TYPE_TO_MIMETYPE: Record<string, string> = {
  image: "image/jpeg",
  video: "video/mp4",
  audio: "audio/ogg",
  file: "application/octet-stream",
  fallback: "application/octet-stream"
};

export async function processFacebookWebhook(
  whatsapp: Whatsapp,
  entry: Record<string, unknown>
): Promise<void> {
  try {
    const messaging: any[] = (entry as any)?.messaging || [];

    for (const evt of messaging) {
      const senderId = evt?.sender?.id;
      const recipientId = evt?.recipient?.id;
      const mid = evt?.message?.mid || `facebook-${Date.now()}`;
      const isEcho = evt?.message?.is_echo === true;

      if (!senderId || !recipientId) continue;
      if (isEcho) continue;

      if (String(recipientId) !== String(whatsapp.facebookPageUserId)) {
        continue;
      }

      const existing = await Message.findOne({ where: { id: mid } });
      if (existing) continue;

      const text = evt?.message?.text || "";
      const hasAttachments =
        Array.isArray(evt?.message?.attachments) && evt.message.attachments.length > 0;
      const attachments: any[] = evt?.message?.attachments || [];
      let body = text || (hasAttachments ? "📎 [attachment]" : "[unsupported]");
      const senderName = evt?.sender?.name || evt?.sender?.username || null;

      let contact = await Contact.findOne({
        where: { number: String(senderId), companyId: whatsapp.companyId }
      });

      if (!contact) {
        contact = await Contact.create({
          name: senderName || `Facebook ${senderId}`,
          number: String(senderId),
          email: "",
          companyId: whatsapp.companyId,
          channel: "facebook"
        });
      } else if (senderName && contact.name !== senderName) {
        await contact.update({ name: senderName });
      }

      const { ticket } = await FindOrCreateTicketService(
        contact,
        whatsapp.id,
        whatsapp.companyId,
        { incrementUnread: true }
      );

      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      if (attachments.length > 0) {
        const att = attachments[0];
        const attType = att?.type || "fallback";
        const payloadUrl = att?.payload?.url;

        if (payloadUrl) {
          try {
            const response = await axios.get(payloadUrl, {
              responseType: "arraybuffer",
              params: { access_token: whatsapp.facebookUserToken }
            });
            const buffer = Buffer.from(response.data);
            const mimeHeader = response.headers["content-type"];
            const mime =
              (typeof mimeHeader === "string" ? mimeHeader.split(";")[0].trim() : null) ||
              ATTACHMENT_TYPE_TO_MIMETYPE[attType] ||
              ATTACHMENT_TYPE_TO_MIMETYPE.fallback;

            const ext = MIME_TO_EXT[mime] || ".bin";
            const filename = `${Date.now()}_fb_${mid}${ext}`;

            mediaUrl = await saveMediaToFile(
              { data: buffer, mimetype: mime, filename },
              { destination: ticket }
            );

            const mt = mime.split("/")[0];
            mediaType = ["audio", "video", "image"].includes(mt) ? mt : "document";
            if (!text) body = `📎 [${attType}]`;
          } catch (err) {
            logger.error({ err, payloadUrl, attType }, "processFacebookWebhook: media download failed");
            if (!text) body = `📎 [${attType}] (Error downloading)`;
          }
        }
      }

      await CreateMessageService({
        messageData: {
          id: mid,
          ticketId: ticket.id,
          contactId: contact.id,
          body,
          fromMe: false,
          read: false,
          mediaUrl,
          mediaType,
          ack: 0,
          channel: "facebook"
        },
        companyId: whatsapp.companyId
      });

      await ticket.update({ lastMessage: body });

      if (ticket.status === "closed") {
        await UpdateTicketService({
          ticketData: { status: "pending" },
          ticketId: ticket.id,
          companyId: whatsapp.companyId
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "processFacebookWebhook: error");
  }
}

