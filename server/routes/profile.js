import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { syncProfile, getViewerState } from "../services/matchmaking.js";

const router = Router();

/**
 * GET /api/profile
 * Returns the current user's profile, presence, and active match (if any).
 * Also used as the "/me" equivalent.
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const state = await getViewerState(req.user);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/profile/sync
 * Upserts the Supabase user into the local profiles + presence tables.
 */
router.post("/sync", requireAuth, async (req, res, next) => {
  try {
    const state = await syncProfile(req.user);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/profile
 * Updates profile fields (bio, age, country, etc.).
 */
router.patch("/", requireAuth, async (req, res, next) => {
  try {
    const { bio, age, country, fullName } = req.body;
    const { query: dbQuery } = await import("../db.js");

    const fields = [];
    const values = [];
    let idx = 1;

    if (bio !== undefined) {
      fields.push(`bio = $${idx++}`);
      values.push(bio);
    }
    if (age !== undefined) {
      fields.push(`age = $${idx++}`);
      values.push(age);
    }
    if (country !== undefined) {
      fields.push(`country = $${idx++}`);
      values.push(country);
    }
    if (fullName !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(fullName);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(req.user.id);
    await dbQuery(
      `UPDATE profiles SET ${fields.join(", ")}, updated_at = now() WHERE id = $${idx}`,
      values
    );

    const state = await getViewerState(req.user);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

export default router;
