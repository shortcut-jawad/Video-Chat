"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../utils/supabase/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setErrorCode(params.get("error"));

    const supabase = createClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadSession = async () => {
      const {
        data: { session: currentSession }
      } = await supabase.auth.getSession();

      if (isMounted) {
        setSession(currentSession);
        setIsLoading(false);
      }
    };

    void loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
      setSession(nextSession);
      setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleGoogle = async () => {
    const supabase = createClient();
    if (!supabase) {
      console.error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY."
      );
      return;
    }

    setIsSigningIn(true);

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });

    if (error) {
      console.error(error.message);
      setIsSigningIn(false);
    }
  };

  return (
    <main className="center-stage">
      <section className="card hero-card">
        <span className="eyebrow">Meet New People Instantly</span>
        <h1 className="hero-title">Meet Match</h1>
        <p className="small">
          Fast video matchmaking with a brighter pulse. Sign in with Google to
          enter the experience.
        </p>
        {errorCode === "google_auth_failed" && (
          <p className="small error-text">Google sign-in failed. Please try again.</p>
        )}
        {errorCode === "google_auth_missing_code" && (
          <p className="small error-text">
            Google sign-in did not return an authorization code. Check the
            Supabase Google redirect URL configuration and try again.
          </p>
        )}
        {errorCode === "missing_supabase_config" && (
          <p className="small error-text">
            Missing `NEXT_PUBLIC_SUPABASE_URL` or
            `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`.
          </p>
        )}
        {!isLoading && !session && (
          <button
            className="btn btn-accent btn-google"
            onClick={handleGoogle}
            disabled={isSigningIn}
          >
            {isSigningIn ? "Redirecting..." : "Sign up with Google"}
          </button>
        )}
        {!isLoading && session && (
          <Link className="btn btn-accent btn-google" href="/dashboard">
            Enter Meet Match
          </Link>
        )}
      </section>
    </main>
  );
}
