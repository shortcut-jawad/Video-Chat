import { verifySupabaseToken } from "../lib/supabase.js";

/**
 * Express middleware that extracts and verifies a Supabase access token.
 *
 * Accepts the token from either:
 *   - Authorization: Bearer <token>
 *   - Cookie: sb-access-token=<token>
 *
 * On success, sets req.user = { id, email, name, avatarUrl }.
 * On failure, responds with 401.
 */
export async function requireAuth(req, res, next) {
  try {
    let token = null;

    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }

    // Fall back to cookie
    if (!token && req.cookies) {
      token = req.cookies["sb-access-token"] ?? null;
    }

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await verifySupabaseToken(token);
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ message: "Authentication failed" });
  }
}
