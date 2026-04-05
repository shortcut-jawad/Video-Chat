import express from "express";
import { AccessToken } from "livekit-server-sdk";
import { requireSupabaseAuth } from "../middleware/supabaseAuth.js";
import { publishUserEvent, publishUserEvents } from "../lib/events.js";
import { listQueueingUserIds } from "../db.js";
import {
  endMatch,
  enterQueue,
  getDevSnapshot,
  getNextCandidate,
  getRoomAccess,
  getStatus,
  markMatchJoined,
  submitCandidateAction,
  leaveQueue
} from "../services/matchmaking.js";

const router = express.Router();

router.use(requireSupabaseAuth);

router.post("/queue/enter", async (req, res, next) => {
  try {
    const { keepChatting = true } = req.body ?? {};
    const result = await enterQueue(req.user, keepChatting);
    publishUserEvent(req.user.id, "USER_QUEUE_JOINED", result);
    const queueingUsers = await listQueueingUserIds([req.user.id]);
    publishUserEvents(queueingUsers, "QUEUE_REFRESH", { triggeredBy: req.user.id });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/queue/leave", async (req, res, next) => {
  try {
    const result = await leaveQueue(req.user);
    publishUserEvent(req.user.id, "USER_QUEUE_LEFT", result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/candidate/next", async (req, res, next) => {
  try {
    const result = await getNextCandidate(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/candidate/action", async (req, res, next) => {
  try {
    const { targetUserId, action, reason = null } = req.body ?? {};

    if (!targetUserId || !action) {
      return res.status(400).json({ message: "targetUserId and action are required" });
    }

    const result = await submitCandidateAction(req.user, targetUserId, action, reason);

    if (result.status === "match_found" && result.match) {
      const peerUserId =
        result.match.userAId === req.user.id ? result.match.userBId : result.match.userAId;
      publishUserEvent(req.user.id, "MUTUAL_MATCH_FOUND", result.match);
      publishUserEvent(peerUserId, "MUTUAL_MATCH_FOUND", {
        ...result.match,
        peer: {
          id: req.user.id,
          fullName: req.user.name,
          avatarUrl: req.user.avatarUrl,
          bio: "Matched with you",
          age: null,
          country: null,
          status: "matched_pending_room",
          isOnline: true
        }
      });
    }

    if (result.status === "blocked") {
      publishUserEvent(req.user.id, "USER_BLOCKED", { targetUserId });
    }

    if (result.status === "reported") {
      publishUserEvent(req.user.id, "USER_REPORTED", { targetUserId });
    }

    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/status", async (req, res, next) => {
  try {
    res.json(await getStatus(req.user));
  } catch (error) {
    next(error);
  }
});

router.post("/room/join", async (req, res, next) => {
  try {
    const { matchId } = req.body ?? {};

    if (!matchId) {
      return res.status(400).json({ message: "matchId is required" });
    }

    const room = await getRoomAccess(req.user, matchId);
    if (!room) {
      return res.status(404).json({ message: "Match not found" });
    }

    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
      return res.status(500).json({ message: "LiveKit not configured" });
    }

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: req.user.id,
        name: req.user.name ?? req.user.email ?? "Meet Match user"
      }
    );

    token.addGrant({
      room: room.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true
    });

    await markMatchJoined(req.user, matchId);
    publishUserEvent(req.user.id, "ROOM_JOINED", { matchId, roomName: room.roomName });

    return res.json({
      matchId: room.matchId,
      roomName: room.roomName,
      token: await token.toJwt(),
      peer: room.peer
    });
  } catch (error) {
    next(error);
  }
});

router.post("/call/end", async (req, res, next) => {
  try {
    const { matchId, endReason = "ended_by_user" } = req.body ?? {};

    if (!matchId) {
      return res.status(400).json({ message: "matchId is required" });
    }

    const match = await endMatch(req.user, matchId, endReason);
    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }

    publishUserEvents([match.userAId, match.userBId], "CALL_ENDED", {
      matchId,
      endReason
    });

    return res.json({ status: "ended", match });
  } catch (error) {
    next(error);
  }
});

router.get("/dev/snapshot", async (req, res, next) => {
  try {
    res.json(await getDevSnapshot());
  } catch (error) {
    next(error);
  }
});

export default router;
