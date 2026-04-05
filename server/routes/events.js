import express from "express";
import { requireSupabaseAuth } from "../middleware/supabaseAuth.js";
import { subscribeToUserEvents } from "../lib/events.js";

const router = express.Router();

router.get("/", requireSupabaseAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const unsubscribe = subscribeToUserEvents(req.user.id, res);
  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
});

export default router;
