import { Request, Response } from "express";
import { Op } from "sequelize";
import { logger } from "../utils/logger";
import Whatsapp from "../models/Whatsapp";
import { processWaCloudWebhook } from "../services/WaCloudServices/WaCloudMessageListener";
import { processInstagramWebhook } from "../services/InstagramServices/InstagramMessageListener";
import { processFacebookWebhook } from "../services/FacebookServices/FacebookMessageListener";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "ticketz";

const normalizeId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
};

const resolveInstagramConnection = async (
  entry: Record<string, unknown>
): Promise<{ whatsapp: Whatsapp | null; candidateIds: string[] }> => {
  const messaging = ((entry as any)?.messaging || []) as Array<Record<string, any>>;
  const changes = ((entry as any)?.changes || []) as Array<Record<string, any>>;

  const candidateIds = Array.from(
    new Set(
      [
        normalizeId((entry as any)?.id),
        ...messaging.map(item => normalizeId(item?.recipient?.id)),
        ...messaging.map(item => normalizeId(item?.sender?.id)),
        ...changes.map(item => normalizeId(item?.value?.id)),
        ...changes.map(item => normalizeId(item?.value?.from?.id)),
        ...changes.map(item => normalizeId(item?.value?.post_id))
      ].filter(Boolean) as string[]
    )
  );

  if (candidateIds.length === 0) {
    return { whatsapp: null, candidateIds: [] };
  }

  const whatsapp = await Whatsapp.findOne({
    where: {
      channel: "instagram",
      [Op.or]: [
        { facebookPageUserId: { [Op.in]: candidateIds } },
        { instagramBusinessAccountId: { [Op.in]: candidateIds } },
        { facebookUserId: { [Op.in]: candidateIds } }
      ]
    }
  });

  return { whatsapp, candidateIds };
};

const resolveFacebookConnection = async (
  entry: Record<string, unknown>
): Promise<{ whatsapp: Whatsapp | null; candidateIds: string[] }> => {
  const messaging = ((entry as any)?.messaging || []) as Array<Record<string, any>>;

  const candidateIds = Array.from(
    new Set(
      [
        normalizeId((entry as any)?.id),
        ...messaging.map(item => normalizeId(item?.recipient?.id)),
        ...messaging.map(item => normalizeId(item?.sender?.id))
      ].filter(Boolean) as string[]
    )
  );

  if (candidateIds.length === 0) {
    return { whatsapp: null, candidateIds: [] };
  }

  const whatsapp = await Whatsapp.findOne({
    where: {
      channel: "facebook",
      [Op.or]: [
        { facebookPageUserId: { [Op.in]: candidateIds } },
        { facebookUserId: { [Op.in]: candidateIds } }
      ]
    }
  });

  return { whatsapp, candidateIds };
};

// ─── Webhook Verification (GET) ───────────────────────────────────────────────
export const verify = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"] as string;
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe") {
    // 1. Check global VERIFY_TOKEN first
    if (token === VERIFY_TOKEN) {
      logger.info("MetaWebhookController: global webhook verified");
      return res.status(200).send(challenge);
    }

    // 2. Check individual tokenMeta from database Connections
    try {
      const whatsapp = await Whatsapp.findOne({
        where: { tokenMeta: token }
      });

      if (whatsapp) {
        logger.info(
          { whatsappId: whatsapp.id, channel: whatsapp.channel },
          "MetaWebhookController: connection webhook verified"
        );
        return res.status(200).send(challenge);
      }
    } catch (err) {
      logger.error({ err }, "MetaWebhookController: error checking tokenMeta");
    }
  }

  return res.status(403).send("Forbidden");
};

// ─── Incoming Webhook (POST) ───────────────────────────────────────────────────
export const receive = async (
  req: Request,
  res: Response
): Promise<Response> => {
  // Always respond 200 immediately to satisfy Meta's 20s requirement
  res.status(200).send("EVENT_RECEIVED");

  const body = req.body;

  try {
    const { object, entry: entries } = body;

    logger.info(
      {
        object,
        entriesCount: Array.isArray(entries) ? entries.length : 0
      },
      "MetaWebhookController.receive: webhook received"
    );

    if (!entries || !Array.isArray(entries)) return;

    for (const entry of entries) {
      if (object === "whatsapp_business_account") {
        // WhatsApp Cloud API — match by phone number ID
        const phoneNumberId =
          entry?.changes?.[0]?.value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const inboundCount = Array.isArray(entry?.changes?.[0]?.value?.messages)
          ? entry.changes[0].value.messages.length
          : 0;

        const whatsapp = await Whatsapp.findOne({
          where: {
            facebookPageUserId: phoneNumberId,
            channel: "whatsapp_cloud"
          }
        });
        if (!whatsapp) {
          logger.warn(
            { phoneNumberId },
            "MetaWebhookController: no WaCloud connection for phone number id"
          );
          continue;
        }

        logger.info(
          {
            whatsappId: whatsapp.id,
            companyId: whatsapp.companyId,
            channel: whatsapp.channel,
            phoneNumberId,
            inboundCount
          },
          "MetaWebhookController.receive: dispatching WaCloud events"
        );

        await processWaCloudWebhook(whatsapp, entry);
      } else if (object === "instagram") {
        // Instagram Messaging — accept Page ID and/or Instagram Business Account ID
        const { whatsapp, candidateIds } = await resolveInstagramConnection(entry);
        if (!whatsapp) {
          logger.warn(
            { candidateIds },
            "MetaWebhookController: no Instagram connection for incoming ids"
          );
          continue;
        }

        logger.info(
          {
            whatsappId: whatsapp.id,
            companyId: whatsapp.companyId,
            channel: whatsapp.channel,
            candidateIds,
            messagingCount: Array.isArray((entry as any)?.messaging)
              ? (entry as any).messaging.length
              : 0,
            changesCount: Array.isArray((entry as any)?.changes)
              ? (entry as any).changes.length
              : 0
          },
          "MetaWebhookController.receive: dispatching Instagram events"
        );

        await processInstagramWebhook(whatsapp, entry);
      } else if (object === "page") {
        // Facebook Page Messaging -> Facebook Messenger
        const { whatsapp: fbWhatsapp, candidateIds } =
          await resolveFacebookConnection(entry);

        if (fbWhatsapp) {
          logger.info(
            {
              whatsappId: fbWhatsapp.id,
              companyId: fbWhatsapp.companyId,
              channel: fbWhatsapp.channel,
              messagingCount: Array.isArray((entry as any)?.messaging)
                ? (entry as any).messaging.length
                : 0,
              changesCount: Array.isArray((entry as any)?.changes)
                ? (entry as any).changes.length
                : 0
            },
            "MetaWebhookController.receive: dispatching Facebook Messenger events"
          );
          await processFacebookWebhook(fbWhatsapp, entry);
          continue;
        }

        // Fallback: some Meta setups deliver Instagram via object=page
        const { whatsapp } = await resolveInstagramConnection(entry);
        if (whatsapp) {
          await processInstagramWebhook(whatsapp, entry);
        } else {
          logger.warn(
            { candidateIds },
            "MetaWebhookController: no Facebook or Instagram connection for page event"
          );
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "MetaWebhookController.receive: error");
  }
};
