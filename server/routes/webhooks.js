import express from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import { publishUserEvents } from "../lib/events.js";
import { recordLiveKitWebhook } from "../services/matchmaking.js";

const router = express.Router();

router.post(
  "/livekit",
  express.raw({ type: "application/webhook+json" }),
  async (req, res, next) => {
    try {
      if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
        return res.status(500).json({ message: "LiveKit not configured" });
      }

      const receiver = new WebhookReceiver(
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET
      );
      const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
      const event = await receiver.receive(body, req.get("Authorization"));
      const result = await recordLiveKitWebhook(event);

      if (result) {
        publishUserEvents(result.userIds, "CALL_ENDED", {
          matchId: result.matchId,
          roomName: result.roomName,
          reason: result.reason
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
