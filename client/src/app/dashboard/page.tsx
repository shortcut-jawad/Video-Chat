"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { apiFetch, type ProfileState } from "../../utils/api";

export default function DashboardPage() {
  const router = useRouter();
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const state = await apiFetch<ProfileState>("/api/profile/me");
        setProfileState(state);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    if (!supabase) {
      setError(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY."
      );
      return;
    }

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setError(signOutError.message);
      return;
    }

    router.replace("/");
  };

  return (
    <main>
      <div className="shell">
        <section className="card stack">
          <span className="eyebrow">Meet Match</span>
          <h1>Home</h1>
          {isLoading && <p className="small">Loading your account...</p>}
          {error && <p className="small error-text">{error}</p>}
          {profileState && (
            <div className="panel-grid two-up">
              <div className="card stack">
                <span className="label">Profile</span>
                <p className="value">{profileState.profile.fullName ?? "Anonymous"}</p>
                <p className="small">Member ID {profileState.profile.id.slice(0, 8)}</p>
                <p className="small">{profileState.profile.bio}</p>
              </div>
              <div className="card stack">
                <span className="label">Availability</span>
                <span className="status-pill">{profileState.presence.status}</span>
                <p className="small">
                  Camera and microphone are requested when you start matching.
                </p>
                {profileState.activeMatch?.peer && (
                  <p className="small">
                    Active match with {profileState.activeMatch.peer.fullName ?? "someone"}.
                  </p>
                )}
              </div>
              <div className="grid-2">
                <Link className="btn btn-accent" href="/lobby">
                  {profileState.activeMatch ? "Resume Match Flow" : "Start Chat"}
                </Link>
                <button className="btn btn-ghost" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
