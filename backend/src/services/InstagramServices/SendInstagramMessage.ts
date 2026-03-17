import axios from "axios";
import * as Sentry from "@sentry/node";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";
import formatBody from "../../helpers/Mustache";
import User from "../../models/User";
import saveMediaToFile from "../../helpers/saveMediaFile";

interface Request {
  body: string;
  ticket: Ticket;
  userId?: number;
  media?: Express.Multer.File;
}

const GRAPH_API_URL = "https://graph.facebook.com/v25.0";
const INSTAGRAM_API_URL = "https://graph.instagram.com/v25.0";

const normalizeMimeType = (mimeType?: string): string => {
  const lower = (mimeType || "application/octet-stream")
    .split(";")[0]
    .trim()
    .toLowerCase();

  const map: Record<string, string> = {
    "audio/mp3": "audio/mpeg",
    "audio/x-mp3": "audio/mpeg",
    "audio/x-mpeg": "audio/mpeg",
    "audio/webm": "audio/ogg",
    "audio/opus": "audio/ogg",
    "video/webm": "video/mp4",
    "video/quicktime": "video/mp4"
  };

  return map[lower] || lower;
};

const attachmentTypeFromMime = (mimeType: string): "audio" | "video" | "image" | "file" => {
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  return "file";
};

const uploadInstagramAttachment = async (
  media: Express.Multer.File,
  accessToken: string,
  attachmentType: "audio" | "video" | "image" | "file"
): Promise<string> => {
  const form = new FormData();

  form.append(
    "message",
    JSON.stringify({
      attachment: {
        type: attachmentType,
        payload: { is_reusable: true }
      }
    })
  );

  form.append("filedata", fs.createReadStream(media.path), {
    filename: path.basename(media.originalname || media.filename || media.path),
    contentType: normalizeMimeType(media.mimetype)
  });

  const resp = await axios.post(
    `${INSTAGRAM_API_URL}/me/message_attachments`,
    form,
    {
      params: { access_token: accessToken },
      headers: {
        ...form.getHeaders()
      },
      timeout: 30000
    }
  );

  const attachmentId = resp.data?.attachment_id;
  if (!attachmentId) {
    throw new Error("Instagram attachment upload returned no attachment_id");
  }

  return attachmentId;
};

const normalizeMetaToken = (rawToken?: string | null): string => {
  if (!rawToken) return "";

  let input = String(rawToken)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

  input = input.replace(/^['"]+|['"]+$/g, "");

  if (!input.startsWith("{") && input.includes('\\"access_token\\"')) {
    try {
      input = JSON.parse(input);
    } catch {
      // segue para os outros formatos
    }
  }

  // 1) Caso o usuário cole o JSON inteiro retornado pelo OAuth
  // Ex.: {"access_token":"EAA...","token_type":"bearer"}
  if (input.startsWith("{") && input.endsWith("}")) {
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed?.access_token === "string") {
        return parsed.access_token.trim();
      }
    } catch {
      // fallback para outros formatos abaixo
    }
  }

  // 2) Querystring/urlencoded ou hash fragment
  // Ex.: access_token=EAA...&token_type=bearer
  if (input.includes("access_token=") || input.includes("#access_token=")) {
    const normalized = input.replace(/^.*#/, "");
    const params = new URLSearchParams(normalized);
    const token = params.get("access_token");
    if (token) return token.trim();
  }

  // 3) access_token em texto livre
  const textMatch = input.match(/access_token\s*[:=]\s*["']?([^"'\s,&}]+)/i);
  if (textMatch?.[1]) return textMatch[1].trim();

  // 4) Caso o usuário cole com prefixo Bearer e/ou aspas extras
  return input
    .replace(/^Bearer\s+/i, "")
    .replace(/^['\"]+|['\"]+$/g, "")
    .replace(/[\r\n\t\s]+/g, "")
    .trim();
};

const SendInstagramMessage = async ({
  body,
  ticket,
  userId,
  media
}: Request): Promise<void> => {
  const { whatsapp } = ticket;

  if (!whatsapp) {
    throw new AppError("ERR_WAPP_NOT_FOUND");
  }

  const {
    facebookUserToken,
    instagramBusinessAccountId,
    facebookPageUserId: pageId,
    facebookUserId
  } = whatsapp;

  const accessToken = normalizeMetaToken(facebookUserToken);
  if (!accessToken) {
    throw new AppError("ERR_INSTAGRAM_NOT_CONFIGURED");
  }

  const idsToTry = Array.from(
    new Set([facebookUserId, pageId, instagramBusinessAccountId].filter(Boolean) as string[])
  );

  const user = userId && (await User.findByPk(userId));
  const formattedBody = formatBody(body, ticket, user);

  let lastError: any = null;

  let mediaType: string | null = null;
  let mediaUrl: string | null = null;

  // Fluxo primário compatível com a evidência validada no n8n
  try {
    let payload: any;

    if (media) {
      const normalizedMime = normalizeMimeType(media.mimetype);
      const attachmentType = attachmentTypeFromMime(normalizedMime);
      const attachmentId = await uploadInstagramAttachment(
        media,
        accessToken,
        attachmentType
      );

      payload = {
        recipient: { id: ticket.contact.number },
        message: {
          attachment: {
            type: attachmentType,
            payload: { attachment_id: attachmentId }
          }
        }
      };

      mediaType = attachmentType === "file" ? "document" : attachmentType;
      mediaUrl = await saveMediaToFile(
        {
          data: fs.readFileSync(media.path),
          mimetype: normalizedMime,
          filename: media.originalname || path.basename(media.path)
        },
        { destination: ticket }
      );
    } else {
      payload = {
        recipient: { id: ticket.contact.number },
        message: { text: formattedBody }
      };
    }

    const response = await axios.post(
      `${INSTAGRAM_API_URL}/me/messages`,
      payload,
      {
        params: { access_token: accessToken },
        headers: { "Content-Type": "application/json" }
      }
    );

    const messageId = response.data?.message_id;

    const messageData = {
      id: messageId || `instagram-${Date.now()}`,
      ticketId: ticket.id,
      contactId: undefined,
      body: formattedBody,
      fromMe: true,
      read: true,
      mediaUrl,
      mediaType,
      ack: 1,
      dataJson: JSON.stringify(response.data)
    };

    await CreateMessageService({
      messageData,
      companyId: ticket.companyId
    });

    await ticket.update({ lastMessage: formattedBody });
    return;
  } catch (err) {
    lastError = err;
    const status = (err as any)?.response?.status;
    const graphError = (err as any)?.response?.data?.error;

    if (status === 401 || graphError?.code === 190) {
      throw new AppError("ERR_INSTAGRAM_INVALID_TOKEN", 400);
    }

    logger.warn(
      {
        status,
        graphCode: graphError?.code,
        graphMessage: graphError?.message
      },
      "SendInstagramMessage: /me/messages failed, trying id-based fallback"
    );
  }

  let tokenLikeErrors = 0;
  let fallbackAttempts = 0;

  for (const igId of idsToTry) {
    const tokenPrefix = accessToken.substring(0, 10);
    const tokenHex = Buffer.from(tokenPrefix).toString("hex");

    try {
      logger.info(
        {
          endpointId: igId,
          recipient: ticket.contact.number,
          tokenLength: accessToken.length,
          tokenPrefix,
          tokenHex
        },
        "SendInstagramMessage: attempt to send message"
      );

      const response = await axios.post(
        `${GRAPH_API_URL}/${igId}/messages`,
        {
          recipient: { id: ticket.contact.number },
          message: { text: formattedBody }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      const messageId = response.data?.message_id;

      const messageData = {
        id: messageId || `instagram-${Date.now()}`,
        ticketId: ticket.id,
        contactId: undefined,
        body: formattedBody,
        fromMe: true,
        read: true,
        mediaUrl: null,
        mediaType: null,
        ack: 1,
        dataJson: JSON.stringify(response.data)
      };

      await CreateMessageService({
        messageData,
        companyId: ticket.companyId
      });

      await ticket.update({ lastMessage: formattedBody });

      // Exit loop on success
      return;
    } catch (err) {
      lastError = err;
      fallbackAttempts += 1;
      const status = (err as any)?.response?.status;
      const graphError = (err as any)?.response?.data?.error;

      logger.warn(
        {
          status,
          endpointId: igId,
          graphCode: graphError?.code,
          graphMessage: graphError?.message
        },
        "SendInstagramMessage: attempt failed, checking for fallback"
      );

      // Token-like errors may happen for a specific endpoint/id combination.
      // Only classify as invalid token if all fallback attempts return token-like errors.
      if (status === 401 || graphError?.code === 190) {
        tokenLikeErrors += 1;
        continue;
      }

      // If it's NOT an "Object not found/permission" error, don't retry either
      if (status !== 400 && graphError?.code !== 100 && graphError?.code !== 10) {
        break; 
      }
      
      // Continue loop to try next ID if available
    }
  }

  if (fallbackAttempts > 0 && tokenLikeErrors === fallbackAttempts) {
    throw new AppError("ERR_INSTAGRAM_INVALID_TOKEN", 400);
  }

  // If we reach here, all attempts failed
  Sentry.captureException(lastError);
  const finalStatus = (lastError as any)?.response?.status;
  const finalGraphError = (lastError as any)?.response?.data?.error;

  logger.error(
    {
      status: finalStatus,
      graphCode: finalGraphError?.code,
      graphMessage: finalGraphError?.message
    },
    "SendInstagramMessage: all attempts failed"
  );

  throw new AppError("ERR_SENDING_INSTAGRAM_MSG");
};

export default SendInstagramMessage;
