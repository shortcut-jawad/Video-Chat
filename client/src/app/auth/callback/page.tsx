"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const finishLogin = async () => {
      const supabase = createClient();
      if (!supabase) {
        router.replace("/?error=missing_supabase_config");
        return;
      }

      try {
        // Handle OAuth callback
        // The Supabase client will automatically handle the code exchange
        // when we check the session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          // If no session after getSession, try explicit code exchange
          const params = new URLSearchParams(window.location.search);
          const code = params.get("code");
          const providerError =
            params.get("error") ??
            params.get("error_code") ??
            params.get("error_description");

          if (providerError) {
            console.error("Provider error:", providerError);
            router.replace("/?error=google_auth_failed");
            return;
          }

          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              console.error("Code exchange error:", error.message);
              router.replace("/?error=google_auth_failed");
              return;
            }
          } else {
            router.replace("/?error=google_auth_missing_code");
            return;
          }
        }

        // Session established successfully
        router.replace("/dashboard");
      } catch (error) {
        console.error("Auth callback error:", error);
        router.replace("/?error=google_auth_failed");
      }
    };

    void finishLogin();
  }, [router]);

  return (
    <main>
      <section className="card stack">
        <h1>Signing you in...</h1>
        <p className="small">Completing Google authentication.</p>
      </section>
    </main>
  );
}
