"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { createClient } from "../../../utils/supabase/client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const liveKitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomName = typeof params.roomName === "string"
    ? decodeURIComponent(params.roomName)
    : Array.isArray(params.roomName)
      ? decodeURIComponent(params.roomName[0])
      : "";

  const matchId = searchParams.get("matchId");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadToken = async () => {
      setError(null);
      setToken(null);

      const supabase = createClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setError("You must be signed in to join a room.");
        return;
      }

      if (!matchId) {
        setError("No match ID provided.");
        return;
      }

      try {
        // Get room access + LiveKit token from our server
        const res = await fetch(`${apiUrl}/api/matchmaking/room/access`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ matchId })
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({ message: "" }));
          setError(payload.message ?? "Could not join room");
          return;
        }

        const data = await res.json();
        setToken(data.token);

        // Mark match as joined
        await fetch(`${apiUrl}/api/matchmaking/room/join`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ matchId })
        }).catch(() => {});
      } catch {
        setError("Failed to connect to the server.");
      }
    };

    void loadToken();
  }, [roomName, matchId]);

  if (!liveKitUrl) {
    return (
      <main>
        <section className="card stack">
          <h1>Room setup missing</h1>
          <p className="small">Set NEXT_PUBLIC_LIVEKIT_URL in client/.env.</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <section className="card stack">
          <h1>Could not join room</h1>
          <p className="small">{error}</p>
          <a className="btn" href="/lobby">
            Back to lobby
          </a>
        </section>
      </main>
    );
  }

  if (!token) {
    return (
      <main>
        <section className="card stack">
          <h1>Connecting...</h1>
          <p className="small">Preparing secure media session for room {roomName}.</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="card stack">
        <h1>Live Video Chat</h1>
        <p className="small">Room: {roomName}</p>
        <div style={{ minHeight: "520px" }} data-lk-theme="default">
          <LiveKitRoom
            token={token}
            serverUrl={liveKitUrl}
            connect
            video
            audio
          >
            <VideoConference />
          </LiveKitRoom>
        </div>
      </section>
    </main>
  );
}
