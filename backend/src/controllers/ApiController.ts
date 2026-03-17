import { Request, Response } from "express";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";

import SendWaCloudMessage from "../services/WaCloudServices/SendWaCloudMessage";
import SendInstagramMessage from "../services/InstagramServices/SendInstagramMessage";
import SendTelegramMessage from "../services/TelegramServices/SendTelegramMessage";
import SendEmailMessage from "../services/EmailServices/SendEmailMessage";
import SendFacebookMessage from "../services/FacebookServices/SendFacebookMessage";

export const startConversation = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req;
  const { number, name, whatsappId, queueId, userId, message } = req.body;

  if (!number || !whatsappId) {
    throw new AppError("Invalid payload. 'number' and 'whatsappId' are required.");
  }

  const whatsapp = await Whatsapp.findOne({
    where: { id: whatsappId, companyId }
  });

  if (!whatsapp) {
    throw new AppError("Whatsapp channel not found for this company.");
  }

  const contact = await CreateOrUpdateContactService({
    name: name || number,
    number: number.toString(),
    companyId,
    channel: whatsapp.channel
  });

  const { ticket } = await FindOrCreateTicketService(
    contact,
    whatsapp.id,
    companyId,
    {
      incrementUnread: false,
      doNotReopen: false,
      queue: queueId ? { id: queueId } as any : undefined
    }
  );

  if (userId || queueId) {
    await ticket.update({
      userId: userId || null,
      queueId: queueId || null,
      status: userId ? "open" : "pending"
    });
  }

  if (message) {
    if (whatsapp.channel === "whatsapp") {
      await req.app.get("queues").messageQueue.add(
        "SendMessage",
        {
          whatsappId: whatsapp.id,
          data: {
            number: number.toString(),
            body: message,
            saveOnTicket: ticket.id
          }
        },
        { removeOnComplete: false, attempts: 3 }
      );
    } else {
      if (whatsapp.channel === "whatsapp_cloud") {
        await SendWaCloudMessage({ body: message, ticket, userId });
      } else if (whatsapp.channel === "instagram") {
        await SendInstagramMessage({ body: message, ticket, userId });
      } else if (whatsapp.channel === "facebook") {
        await SendFacebookMessage({ body: message, ticket, userId });
      } else if (whatsapp.channel === "telegram") {
        await SendTelegramMessage({ body: message, ticket, userId });
      } else if (whatsapp.channel === "email") {
        await SendEmailMessage({ body: message, ticket, userId });
      }
    }
  }

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit(
    `company-${companyId}-ticket`,
    {
      action: "update",
      ticket
    }
  );

  return res.status(200).json({ ticket });
};
