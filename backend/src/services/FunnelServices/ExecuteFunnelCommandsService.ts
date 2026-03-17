import Ticket from "../../models/Ticket";
import Tag from "../../models/Tag";
import Contact from "../../models/Contact";
import ContactTag from "../../models/ContactTag";
import Funnel from "../../models/Funnel";
import { Op } from "sequelize";
import { logger } from "../../utils/logger";
import formatBody from "../../helpers/Mustache";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import { verifyMessage } from "../WbotServices/wbotMessageListener";
import { getJidOf } from "../WbotServices/getJidOf";
import SendTelegramMessage from "../TelegramServices/SendTelegramMessage";
import SendWaCloudMessage from "../WaCloudServices/SendWaCloudMessage";
import SendFacebookMessage from "../FacebookServices/SendFacebookMessage";

// ─── Command Types ────────────────────────────────────────────────────────────
// { "type": "set_contact_tag", "tagId": 12, "advance_only": true }
// { "type": "transfer_queue", "queueId": 5 }
// { "type": "send_message", "message": "Texto..." }
// ─────────────────────────────────────────────────────────────────────────────

interface FunnelCommand {
  type?: "set_contact_tag" | "transfer_queue" | "send_message";
  action?: "addContactTag" | "setContactTag" | "transferQueue" | "sendMessage";
  command?: "addContactTag" | "setContactTag" | "transferQueue" | "sendMessage";
  tag?: number;
  tagId?: number;
  queue?: number;
  queueId?: number;
  text?: string;
  content?: string;
  message?: string;
  advanceOnly?: boolean;
  advance_only?: boolean;
}

const normalizeCommand = (raw: FunnelCommand) => {
  const normalizedType =
    raw.type ||
    (raw.action === "addContactTag" || raw.action === "setContactTag"
      ? "set_contact_tag"
      : raw.action === "transferQueue"
      ? "transfer_queue"
      : raw.action === "sendMessage"
      ? "send_message"
      : undefined) ||
    (raw.command === "addContactTag" || raw.command === "setContactTag"
      ? "set_contact_tag"
      : raw.command === "transferQueue"
      ? "transfer_queue"
      : raw.command === "sendMessage"
      ? "send_message"
      : undefined);

  return {
    type: normalizedType,
    tagId: raw.tagId ?? raw.tag,
    queueId: raw.queueId ?? raw.queue,
    message: raw.message ?? raw.text ?? raw.content,
    advanceOnly: Boolean(raw.advance_only ?? raw.advanceOnly)
  };
};

/**
 * Gets the order (kanban position) of a tag in its funnel.
 * Returns -1 if the tag is not in any funnel.
 */
const getTagFunnelOrder = async (tagId: number): Promise<number> => {
  const tag = await Tag.findByPk(tagId, { attributes: ["kanban"] });
  return tag ? (tag.kanban ?? -1) : -1;
};

/**
 * Gets the current active contact-funnel tag for a contact, filtered by the
 * same funnel as the target tag.
 */
const getCurrentContactFunnelTag = async (
  contactId: number,
  funnelId: number
): Promise<ContactTag & { tag?: Tag } | null> => {
  // Find all tags belonging to this funnel
  const funnelTags = await Tag.findAll({
    where: { funnelId },
    attributes: ["id", "kanban"]
  });
  const funnelTagIds = funnelTags.map(t => t.id);

  if (funnelTagIds.length === 0) return null;

  // Find current contact tag among those
  const existing = await ContactTag.findOne({
    where: { contactId, tagId: { [Op.in]: funnelTagIds } },
    include: [{ model: Tag, as: "tag" }]
  }) as (ContactTag & { tag?: Tag }) | null;

  return existing;
};

/**
 * Execute a `set_contact_tag` command: sets the contact's tag within a
 * contact-type funnel, replacing any existing tag in that funnel.
 *
 * If `advance_only` is true, the command is skipped if the contact is already
 * at a later stage.
 */
const executeSetContactTag = async (
  ticket: Ticket,
  targetTagId: number,
  advanceOnly: boolean
) => {
  try {
    const targetTag = await Tag.findByPk(targetTagId, {
      include: [{ model: Funnel, as: "funnel" }]
    });

    if (!targetTag || !targetTag.funnelId) {
      logger.warn(
        { targetTagId },
        "ExecuteFunnelCommands: target tag not found or has no funnel"
      );
      return;
    }

    const contactId = ticket.contactId;
    const funnelId = targetTag.funnelId;

    // Fetch all tags in this funnel for order-checking
    const funnelTags = await Tag.findAll({
      where: { funnelId },
      attributes: ["id", "kanban"]
    });
    const funnelTagIds = funnelTags.map(t => t.id);

    // Current contact-funnel tag
    const currentBinding = await ContactTag.findOne({
      where: { contactId, tagId: { [Op.in]: funnelTagIds } }
    }) as (ContactTag & { tagId: number }) | null;

    if (advanceOnly && currentBinding) {
      // Get kanban order of current and target
      const currentTag = funnelTags.find(t => t.id === currentBinding.tagId);
      const targetOrder = targetTag.kanban ?? 0;
      const currentOrder = currentTag?.kanban ?? 0;

      // Skip if the contact is already at the same stage or further
      if (currentOrder >= targetOrder) {
        logger.info(
          { contactId, currentOrder, targetOrder },
          "ExecuteFunnelCommands: advance_only - skipping because contact is already at equal or higher stage"
        );
        return;
      }
    }

    // Remove all existing contact tags in this funnel
    if (funnelTagIds.length > 0) {
      await ContactTag.destroy({
        where: { contactId, tagId: { [Op.in]: funnelTagIds } }
      });
    }

    // Add the new tag
    await ContactTag.create({ contactId, tagId: targetTagId });

    logger.info(
      { contactId, targetTagId },
      "ExecuteFunnelCommands: contact tag updated"
    );
  } catch (err) {
    logger.error(
      { err },
      "ExecuteFunnelCommands: error executing set_contact_tag"
    );
  }
};

/**
 * Execute a `transfer_queue` command: moves the ticket to another queue.
 * We use a direct DB update here to avoid circular imports with UpdateTicketService.
 */
const executeTransferQueue = async (ticket: Ticket, queueId: number) => {
  try {
    await ticket.update({ queueId, status: "pending", userId: null });
    logger.info(
      { ticketId: ticket.id, queueId },
      "ExecuteFunnelCommands: ticket transferred to queue"
    );
  } catch (err) {
    logger.error(
      { err },
      "ExecuteFunnelCommands: error executing transfer_queue"
    );
  }
};

/**
 * Execute a `send_message` command.
 * Tries to send a text message through the ticket's channel.
 */
const executeSendMessage = async (ticket: Ticket, message: string) => {
  try {
    const messageText = formatBody(message, ticket);

    if (ticket.channel === "whatsapp") {
      const wbot = await GetTicketWbot(ticket);
      const sentMsg = await wbot.sendMessage(getJidOf(ticket), { text: messageText });
      await verifyMessage(sentMsg, ticket, ticket.contact);
    } else if (ticket.channel === "telegram") {
      await SendTelegramMessage({ body: messageText, ticket });
    } else if (ticket.channel === "whatsapp_cloud") {
      await SendWaCloudMessage({ body: messageText, ticket });
    } else if (ticket.channel === "facebook") {
      await SendFacebookMessage({ body: messageText, ticket });
    }
    // Other channels: no automatic message for now
    logger.info(
      { ticketId: ticket.id },
      "ExecuteFunnelCommands: send_message executed"
    );
  } catch (err) {
    logger.error(
      { err },
      "ExecuteFunnelCommands: error executing send_message"
    );
  }
};

/**
 * Main entry point.
 * Called from UpdateTicketService after the ticket's stage tag has been updated.
 */
const ExecuteFunnelCommandsService = async (
  ticket: Ticket,
  stageTag: Tag
): Promise<void> => {
  const rawCommands = stageTag.commands;
  if (!rawCommands) return;

  let commands: FunnelCommand[];
  try {
    const parsed = JSON.parse(rawCommands);
    commands = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    logger.warn(
      { stageTagId: stageTag.id, raw: rawCommands },
      "ExecuteFunnelCommands: invalid JSON in commands, skipping"
    );
    return;
  }

  for (const rawCmd of commands) {
    const cmd = normalizeCommand(rawCmd);

    if (cmd.type === "set_contact_tag") {
      if (!cmd.tagId) continue;
      await executeSetContactTag(ticket, cmd.tagId, cmd.advanceOnly);
    } else if (cmd.type === "transfer_queue") {
      if (!cmd.queueId) continue;
      await executeTransferQueue(ticket, cmd.queueId);
    } else if (cmd.type === "send_message") {
      if (!cmd.message) continue;
      await executeSendMessage(ticket, cmd.message);
    } else {
      logger.warn(
        { cmd: rawCmd },
        "ExecuteFunnelCommands: unknown command type, skipping"
      );
    }
  }
};

export default ExecuteFunnelCommandsService;
