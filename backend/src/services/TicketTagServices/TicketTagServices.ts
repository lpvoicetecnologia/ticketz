import AppError from "../../errors/AppError";
import { Op } from "sequelize";
import Funnel from "../../models/Funnel";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import TicketTag from "../../models/TicketTag";
import ExecuteFunnelCommandsService from "../FunnelServices/ExecuteFunnelCommandsService";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";

export async function ticketTagAdd(
  ticketId: number,
  tagId: number,
  companyId?: number
) {
  const ticket = await ShowTicketService(ticketId, companyId);
  if (!ticket) {
    throw new AppError("ERR_NOT_FOUND", 404);
  }

  if (companyId && ticket.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const tag = await Tag.findByPk(tagId, {
    include: [{ model: Funnel, as: "funnel", attributes: ["id", "type"] }]
  });
  if (!tag) {
    throw new AppError("ERR_NOT_FOUND", 404);
  }

  if (ticket.companyId !== tag.companyId) {
    throw new AppError("ERR_NOT_FOUND", 404);
  }

  if (tag.funnelId) {
    const funnelTags = await Tag.findAll({
      where: { funnelId: tag.funnelId },
      attributes: ["id"]
    });
    const funnelTagIds = funnelTags.map(t => t.id);

    if (funnelTagIds.length > 0) {
      await TicketTag.destroy({
        where: {
          ticketId,
          tagId: { [Op.in]: funnelTagIds }
        }
      });
    }
  }

  const [ticketTag] = await TicketTag.findOrCreate({
    where: {
      ticketId,
      tagId
    },
    defaults: {
      ticketId,
      tagId
    }
  });

  if (!ticketTag) {
    throw new AppError("ERR_UNKNOWN", 400);
  }

  if (tag.funnelId && tag.funnel?.type === "ticket") {
    const updatedTicket = await ShowTicketService(ticketId, companyId);
    await ExecuteFunnelCommandsService(updatedTicket, tag);
  }

  await ticket.reload();
  websocketUpdateTicket(ticket);

  return ticketTag;
}

export async function ticketTagRemove(
  ticketId: number,
  tagId: number,
  companyId?: number
) {
  const ticket = await ShowTicketService(ticketId, companyId);
  if (!ticket) {
    throw new AppError("ERR_NOT_FOUND", 404);
  }

  if (companyId && ticket.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  await TicketTag.destroy({
    where: {
      ticketId,
      tagId
    }
  });

  await ticket.reload();
  websocketUpdateTicket(ticket);
}

export async function ticketTagRemoveAll(ticketId: number, companyId?: number) {
  const ticket = await ShowTicketService(ticketId, companyId);
  if (!ticket) {
    throw new AppError("ERR_NOT_FOUND", 404);
  }

  if (companyId && ticket.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  await TicketTag.destroy({
    where: {
      ticketId
    }
  });

  await ticket.reload();
  websocketUpdateTicket(ticket);
}
