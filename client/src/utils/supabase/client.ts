import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const createClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase configuration:");
    console.error("NEXT_PUBLIC_SUPABASE_URL:", !!supabaseUrl);
    console.error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY:",
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    console.error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:",
      !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
    );
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseKey, {
      auth: {
        flowType: "pkce",
      },
    });
  }

  return browserClient;
};
