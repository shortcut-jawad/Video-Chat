import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  enterQueue,
  leaveQueue,
  getNextCandidate,
  submitCandidateAction,
  getStatus,
  getRoomAccess,
  markMatchJoined,
  endMatch
} from "../services/matchmaking.js";
import { createRoomToken } from "../lib/livekit.js";

const router = Router();

/**
 * POST /api/matchmaking/queue/join
 * Enter the matchmaking queue and get the first candidate (if any).
 */
router.post("/queue/join", requireAuth, async (req, res, next) => {
  try {
    const keepChatting = req.body.keepChatting !== false;
    const result = await enterQueue(req.user, keepChatting);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/matchmaking/queue/leave
 * Leave the matchmaking queue.
 */
router.post("/queue/leave", requireAuth, async (req, res, next) => {
  try {
    const result = await leaveQueue(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/matchmaking/candidate
 * Get the next candidate to review.
 */
router.get("/candidate", requireAuth, async (req, res, next) => {
  try {
    const result = await getNextCandidate(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/matchmaking/candidate/action
 * Submit an action on a candidate (accept, reject, block, report).
 */
router.post("/candidate/action", requireAuth, async (req, res, next) => {
  try {
    const { targetUserId, action, reason } = req.body;

    if (!targetUserId || !action) {
      return res
        .status(400)
        .json({ message: "targetUserId and action are required" });
    }

    const result = await submitCandidateAction(
      req.user,
      targetUserId,
      action,
      reason ?? null
    );

    if (result.status === "invalid_action") {
      return res
        .status(400)
        .json({ message: "Invalid action. Use: accept, reject, block, report" });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/matchmaking/status
 * Get current presence + active match info.
 */
router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const result = await getStatus(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/matchmaking/room/access
 * Get room access details for an active match and generate a LiveKit token.
 */
router.post("/room/access", requireAuth, async (req, res, next) => {
  try {
    const { matchId } = req.body;

    if (!matchId) {
      return res.status(400).json({ message: "matchId is required" });
    }

    const access = await getRoomAccess(req.user, matchId);
    if (!access) {
      return res
        .status(404)
        .json({ message: "Match not found or already ended" });
    }

    // Generate LiveKit token for the room
    const token = await createRoomToken(
      req.user.id,
      access.roomName,
      req.user.name
    );

    res.json({
      ...access,
      token
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/matchmaking/room/join
 * Mark the user as joined in the room (sets match to in_progress).
 */
router.post("/room/join", requireAuth, async (req, res, next) => {
  try {
    const { matchId } = req.body;

    if (!matchId) {
      return res.status(400).json({ message: "matchId is required" });
    }

    const result = await markMatchJoined(req.user, matchId);
    if (!result) {
      return res
        .status(404)
        .json({ message: "Match not found or already ended" });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/matchmaking/end
 * End the current match.
 */
router.post("/end", requireAuth, async (req, res, next) => {
  try {
    const { matchId, reason } = req.body;

    if (!matchId) {
      return res.status(400).json({ message: "matchId is required" });
    }

    const result = await endMatch(req.user, matchId, reason ?? "ended_by_user");
    if (!result) {
      return res
        .status(404)
        .json({ message: "Match not found or already ended" });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
