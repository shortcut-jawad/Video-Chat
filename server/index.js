import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { getDatabaseStatus, initializeDatabase } from "./db.js";
import profileRoutes from "./routes/profile.js";
import matchmakingRoutes from "./routes/matchmaking.js";
import eventsRoutes from "./routes/events.js";
import webhookRoutes from "./routes/webhooks.js";

const app = express();
const port = process.env.PORT ?? 8000;
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

app.use(
  cors({
    origin: webOrigin,
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json());

app.get("/", (_, res) => {
  const database = getDatabaseStatus();
  res
    .status(database.ready ? 200 : 503)
    .json({ status: "Meet Match server running", database });
});

app.get("/health", (_, res) => {
  const database = getDatabaseStatus();
  res
    .status(database.ready ? 200 : 503)
    .json({ ok: database.ready, database });
});

function requireDatabaseReady(req, res, next) {
  const database = getDatabaseStatus();

  if (database.ready) {
    return next();
  }

  if (!database.initializing) {
    void initializeDatabase().catch((error) => {
      console.error("Database initialization retry failed:", error);
    });
  }

  return res.status(503).json({
    message: "Database is not ready. Check DATABASE_URL and database availability.",
    database
  });
}

app.use("/api/webhooks", requireDatabaseReady, webhookRoutes);
app.use("/api/profile", requireDatabaseReady, profileRoutes);
app.use("/api/matchmaking", requireDatabaseReady, matchmakingRoutes);
app.use("/api/events", requireDatabaseReady, eventsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

app.listen(port, () => {
  console.log(`Meet Match server listening on ${port}`);
});

void initializeDatabase().catch((error) => {
  console.error("Database initialization failed:", error);
});
