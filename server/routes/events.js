import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getStatus, getDevSnapshot } from "../services/matchmaking.js";

const router = Router();

/**
 * GET /api/events/poll
 * Simple polling endpoint — returns current presence + active match.
 * Client should call this every few seconds while in queue.
 */
router.get("/poll", requireAuth, async (req, res, next) => {
  try {
    const result = await getStatus(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/events/dev/snapshot
 * Development-only: returns a full snapshot of all database tables.
 */
router.get("/dev/snapshot", async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Not available in production" });
    }

    const snapshot = await getDevSnapshot();
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

export default router;
