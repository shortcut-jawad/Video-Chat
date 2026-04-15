import { getSupabaseServerClient } from "../lib/supabase.js";

export async function requireSupabaseAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return res.status(401).json({ message: "Missing auth token" });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return res.status(500).json({
        message:
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY on server."
      });
    }

    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: "Invalid auth token" });
    }

    req.user = {
      id: user.id,
      email: user.email ?? null,
      name:
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email ??
        "Meet Match user",
      avatarUrl: user.user_metadata?.avatar_url ?? null,
      authUser: user,
      accessToken: token
    };

    return next();
  } catch (error) {
    return next(error);
  }
}
