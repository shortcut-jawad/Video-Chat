import express from "express";
import { requireSupabaseAuth } from "../middleware/supabaseAuth.js";
import { getViewerState, syncProfile } from "../services/matchmaking.js";
import { publishUserEvent } from "../lib/events.js";

const router = express.Router();

router.get("/me", requireSupabaseAuth, async (req, res, next) => {
  try {
    const state = await getViewerState(req.user);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

router.post("/sync", requireSupabaseAuth, async (req, res, next) => {
  try {
    const state = await syncProfile(req.user);
    publishUserEvent(req.user.id, "PROFILE_SYNCED", state);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

export default router;
