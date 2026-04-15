"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ViewerProfile = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  age: number | null;
  country: string | null;
  isProfileComplete: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setError("You are not signed in yet.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${apiUrl}/api/profile`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (!res.ok) {
          setError("Failed to load profile.");
          setLoading(false);
          return;
        }

        const data = await res.json();
        setProfile(data.profile);
      } catch {
        setError("Could not reach the server.");
      }

      setLoading(false);
    };

    void load();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/");
  };

  if (loading) {
    return (
      <main>
        <section className="card stack">
          <h1>Loading...</h1>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="card stack">
        <h1>Account Dashboard</h1>
        {error && <p className="small">{error}</p>}
        {profile && (
          <div className="stack">
            {profile.avatarUrl && (
              <img
                src={profile.avatarUrl}
                alt="Avatar"
                style={{ width: 64, height: 64, borderRadius: "50%" }}
              />
            )}
            <p>Signed in as {profile.fullName ?? "User"}</p>
            <p className="small">Account ID: {profile.id}</p>
            {profile.bio && <p className="small">Bio: {profile.bio}</p>}
            <div className="grid-2">
              <a className="btn btn-accent" href="/lobby">
                Go to lobby
              </a>
              <button className="btn" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        )}
        {!profile && !error && (
          <p className="small">No profile data available.</p>
        )}
      </section>
    </main>
  );
}
