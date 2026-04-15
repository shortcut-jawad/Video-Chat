"use client";

import { createClient } from "../utils/supabase/client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function HomePage() {
  const handleGoogleLogin = async () => {
    const supabase = createClient();
    if (!supabase) {
      alert("Supabase is not configured. Check your environment variables.");
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      console.error("Google login error:", error.message);
    }
  };

  const handleFacebookLogin = async () => {
    const supabase = createClient();
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      console.error("Facebook login error:", error.message);
    }
  };

  const handleAppleLogin = async () => {
    const supabase = createClient();
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      console.error("Apple login error:", error.message);
    }
  };

  return (
    <main>
      <div className="stack">
        <section className="card stack">
          <h1>Welcome to VideoChat HQ</h1>
          <p className="small">
            Sign in to start or join a live room. We keep your identity linked
            to a secure video-session token so your calls stay protected.
          </p>
          <div className="grid-2">
            <button className="btn" onClick={handleGoogleLogin}>
              Continue with Google
            </button>
            <button className="btn" onClick={handleFacebookLogin}>
              Continue with Facebook
            </button>
            <button className="btn" onClick={handleAppleLogin}>
              Continue with Apple ID
            </button>
            <a className="btn btn-accent" href="/lobby">
              Enter Lobby
            </a>
          </div>
        </section>
        <section className="card stack">
          <h2>Why sign in?</h2>
          <p className="small">
            We issue a signed access token that unlocks private rooms, creates
            LiveKit session keys, and ties your chat identity to your account.
          </p>
        </section>
      </div>
    </main>
  );
}
