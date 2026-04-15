import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

export function getSupabaseAdmin() {
  if (!supabase) {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
      );
    }
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabase;
}

/**
 * Verify a Supabase access token and return the user object.
 * Returns null if the token is invalid or expired.
 */
export async function verifySupabaseToken(accessToken) {
  if (!accessToken) {
    return null;
  }

  const admin = getSupabaseAdmin();
  const {
    data: { user },
    error
  } = await admin.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    avatarUrl: user.user_metadata?.avatar_url ?? null
  };
}
