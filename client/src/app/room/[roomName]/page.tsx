"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { apiFetch } from "../../../utils/api";
import { useServerEvents } from "../../../utils/useServerEvents";

const liveKitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomName: string }>();
  const matchId = useMemo(() => decodeURIComponent(params.roomName), [params.roomName]);
  const touchStartRef = useRef<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [peerName, setPeerName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const loadToken = async () => {
      setError(null);
      setToken(null);

      try {
        const data = await apiFetch<{
          matchId: string;
          roomName: string;
          token: string;
          peer: { fullName: string | null } | null;
        }>("/api/matchmaking/room/join", {
          method: "POST",
          body: JSON.stringify({ matchId })
        });
        setToken(data.token);
        setRoomName(data.roomName);
        setPeerName(data.peer?.fullName ?? null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not create room token");
      }
    };

    void loadToken();
  }, [matchId]);

  useServerEvents({
    CALL_ENDED: (payload: unknown) => {
      const data = payload as { matchId?: string; reason?: string };
      if (data.matchId !== matchId) {
        return;
      }
      setBanner("Call ended");
      window.setTimeout(() => {
        router.replace("/lobby?ended=1");
      }, 900);
    }
  });

  const handleEndCall = async (endReason: string) => {
    try {
      await apiFetch("/api/matchmaking/call/end", {
        method: "POST",
        body: JSON.stringify({ matchId, endReason })
      });
      router.replace("/lobby?ended=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to end call");
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartRef.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const touchStart = touchStartRef.current;
    const touchEnd = event.changedTouches[0]?.clientX ?? null;
    touchStartRef.current = null;

    if (touchStart !== null && touchEnd !== null && touchStart - touchEnd > 80) {
      void handleEndCall("swiped_left");
    }
  };

  if (!liveKitUrl) {
    return (
      <main>
        <section className="card stack">
          <span className="eyebrow">Meet Match</span>
          <h1>Room setup missing</h1>
          <p className="small">Set NEXT_PUBLIC_LIVEKIT_URL in client/.env.example.</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <section className="card stack">
          <span className="eyebrow">Meet Match</span>
          <h1>Could not join room</h1>
          <p className="small error-text">{error}</p>
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
          <span className="eyebrow">Meet Match</span>
          <h1>Connecting...</h1>
          <p className="small">Preparing secure media session.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="room-shell">
      <section className="card stack">
        <span className="eyebrow">Meet Match</span>
        <h1>Live Match</h1>
        <div className="grid-2 room-meta">
          <span className="status-pill">Room {roomName}</span>
          <span className="status-pill">
            {peerName ? `Talking to ${peerName}` : "Waiting for your match"}
          </span>
        </div>
        {banner && <p className="small">{banner}</p>}
        <div
          className="frame room-frame"
          style={{ minHeight: "520px" }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <LiveKitRoom
            token={token}
            serverUrl={liveKitUrl}
            connect
            video
            audio
            data-lk-theme="default"
          >
            <VideoConference />
          </LiveKitRoom>
        </div>
        <div className="grid-2">
          <button className="btn btn-accent" onClick={() => void handleEndCall("ended_by_user")}>
            End Call
          </button>
          <p className="small">Swipe left anywhere on the call panel to end instantly.</p>
        </div>
      </section>
    </main>
  );
}
