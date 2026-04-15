import { Router } from "express";
import { recordLiveKitWebhook } from "../services/matchmaking.js";

const router = Router();

/**
 * POST /api/webhooks/livekit
 * Receives webhook events from LiveKit.
 * When a participant leaves or room finishes, ends the associated match.
 */
router.post("/livekit", async (req, res, next) => {
  try {
    const event = req.body;

    if (!event || !event.event) {
      return res.status(400).json({ message: "Invalid webhook payload" });
    }

    console.log(`[LiveKit Webhook] ${event.event}`, {
      room: event.room?.name ?? "n/a",
      participant: event.participant?.identity ?? "n/a"
    });

    const result = await recordLiveKitWebhook(event);

    if (result) {
      console.log(`[LiveKit Webhook] Match ended`, {
        matchId: result.matchId,
        reason: result.reason,
        users: result.userIds
      });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
