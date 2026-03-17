import axios from "axios";
import * as Sentry from "@sentry/node";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import CreateMessageService from "../MessageServices/CreateMessageService";
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

const uploadMessengerAttachment = async (
  media: Express.Multer.File,
  pageAccessToken: string,
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
    `${GRAPH_API_URL}/me/message_attachments`,
    form,
    {
      params: { access_token: pageAccessToken },
      headers: {
        ...form.getHeaders()
      },
      timeout: 30000
    }
  );

  const attachmentId = resp.data?.attachment_id;
  if (!attachmentId) {
    throw new Error("Messenger attachment upload returned no attachment_id");
  }

  return attachmentId;
};

const SendFacebookMessage = async ({ body, ticket, userId, media }: Request): Promise<void> => {
  const { whatsapp } = ticket;

  if (!whatsapp) {
    throw new AppError("ERR_WAPP_NOT_FOUND");
  }

  const { facebookUserToken, facebookPageUserId } = whatsapp;
  if (!facebookUserToken || !facebookPageUserId) {
    throw new AppError("ERR_FACEBOOK_NOT_CONFIGURED");
  }

  const user = userId && (await User.findByPk(userId));
  const formattedBody = formatBody(body, ticket, user || null);

  let mediaType: string | null = null;
  let mediaUrl: string | null = null;

  try {
    let payload: any;

    if (media) {
      const normalizedMime = normalizeMimeType(media.mimetype);
      const attachmentType = attachmentTypeFromMime(normalizedMime);
      const attachmentId = await uploadMessengerAttachment(
        media,
        facebookUserToken,
        attachmentType
      );

      payload = {
        recipient: { id: ticket.contact.number },
        message: {
          attachment: {
            type: attachmentType,
            payload: { attachment_id: attachmentId }
          }
        },
        messaging_type: "RESPONSE"
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
        message: { text: formattedBody },
        messaging_type: "RESPONSE"
      };
    }

    const response = await axios.post(
      `${GRAPH_API_URL}/me/messages`,
      payload,
      {
        params: { access_token: facebookUserToken }
      }
    );

    const messageId = response.data?.message_id || `facebook-${Date.now()}`;

    const messageData = {
      id: messageId,
      ticketId: ticket.id,
      body: formattedBody,
      fromMe: true,
      read: true,
      mediaUrl,
      mediaType,
      ack: 1,
      channel: "facebook",
      dataJson: JSON.stringify(response.data)
    };

    await CreateMessageService({ messageData, companyId: ticket.companyId });

    await Ticket.update({ lastMessage: formattedBody }, { where: { id: ticket.id } });
  } catch (err: any) {
    Sentry.captureException(err);
    const apiError = err?.response?.data?.error;
    throw new AppError(
      `ERR_SENDING_FACEBOOK_MSG: ${apiError?.message || err?.message || "unknown"}`,
      err?.response?.status || 500
    );
  }
};

export default SendFacebookMessage;

