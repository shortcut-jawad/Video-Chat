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
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const providerError =
          params.get("error") ?? params.get("error_code") ?? params.get("error_description");

        if (providerError) {
          console.error("Provider error:", providerError);
          router.replace("/?error=auth_failed");
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("Code exchange error:", error.message);
            router.replace("/?error=auth_failed");
            return;
          }
        }

        // Verify the session was established
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) {
          console.error("No user after callback:", userError?.message);
          router.replace("/?error=auth_failed");
          return;
        }

        // Sync profile to our backend
        const session = (await supabase.auth.getSession()).data.session;
        if (session?.access_token) {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
          await fetch(`${apiUrl}/api/profile/sync`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json"
            }
          }).catch((err) => console.warn("Profile sync failed:", err));
        }

        router.replace("/dashboard");
      } catch (error) {
        console.error("Auth callback error:", error);
        router.replace("/?error=auth_failed");
      }
    };

    void finishLogin();
  }, [router]);

  return (
    <main>
      <section className="card stack">
        <h1>Signing you in...</h1>
        <p className="small">Completing authentication.</p>
      </section>
    </main>
  );
}
