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

      const params = new URLSearchParams(window.location.search);
      const providerError =
        params.get("error") ?? params.get("error_code") ?? params.get("error_description");
      const code = params.get("code");

      if (providerError) {
        router.replace("/?error=google_auth_failed");
        return;
      }

      if (!code) {
        router.replace("/?error=google_auth_missing_code");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error(error.message);
        router.replace("/?error=google_auth_failed");
        return;
      }

      router.replace("/dashboard");
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
