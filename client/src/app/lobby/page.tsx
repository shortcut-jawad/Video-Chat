"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Candidate = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  age: number | null;
  country: string | null;
  status: string;
  isOnline: boolean;
};

type MatchInfo = {
  id: string;
  roomName: string;
  peer: Candidate | null;
};

export default function LobbyPage() {
  const router = useRouter();
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const keepSearchingRef = useRef(false);

  const getToken = useCallback(async (): Promise<string | null> => {
    const supabase = createClient();
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const handleStartChat = async () => {
    const token = await getToken();
    if (!token) {
      setError("Please sign in first.");
      return;
    }

    setIsSearching(true);
    keepSearchingRef.current = true;
    setError(null);
    setCandidate(null);
    setStatus("Joining queue...");

    try {
      // Join the matchmaking queue
      const joinRes = await fetch(`${apiUrl}/api/matchmaking/queue/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ keepChatting: true })
      });

      if (!joinRes.ok) {
        const payload = await joinRes.json().catch(() => ({ message: "" }));
        throw new Error(payload.message ?? "Could not join queue");
      }

      const joinData = await joinRes.json();

      // If immediately matched
      if (joinData.status === "match_found" && joinData.match?.roomName) {
        keepSearchingRef.current = false;
        await navigateToRoom(token, joinData.match);
        return;
      }

      // If candidate is ready, show them
      if (joinData.status === "candidate_ready" && joinData.candidate) {
        setCandidate(joinData.candidate);
        setStatus("Candidate found! Accept or skip.");
        // Auto-accept for now (you can add UI buttons later)
        await handleAcceptCandidate(token, joinData.candidate.id);
        return;
      }

      // Poll for matches
      setStatus("Looking for a partner...");
      while (keepSearchingRef.current) {
        await wait(2000);
        if (!keepSearchingRef.current) break;

        const pollRes = await fetch(`${apiUrl}/api/events/poll`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!pollRes.ok) continue;

        const pollData = await pollRes.json();

        if (pollData.activeMatch?.roomName) {
          keepSearchingRef.current = false;
          await navigateToRoom(token, pollData.activeMatch);
          return;
        }

        // Try to get next candidate
        const candRes = await fetch(`${apiUrl}/api/matchmaking/candidate`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (candRes.ok) {
          const candData = await candRes.json();
          if (candData.status === "match_found" && candData.match?.roomName) {
            keepSearchingRef.current = false;
            await navigateToRoom(token, candData.match);
            return;
          }
          if (candData.status === "candidate_ready" && candData.candidate) {
            setCandidate(candData.candidate);
            setStatus("Candidate found!");
            await handleAcceptCandidate(token, candData.candidate.id);
            return;
          }
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to start chat");
    }

    setStatus("Idle");
    setIsSearching(false);
  };

  const handleAcceptCandidate = async (token: string, targetUserId: string) => {
    setStatus("Accepting...");
    try {
      const res = await fetch(`${apiUrl}/api/matchmaking/candidate/action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ targetUserId, action: "accept" })
      });

      if (!res.ok) {
        throw new Error("Failed to accept candidate");
      }

      const data = await res.json();

      if (data.status === "match_found" && data.match?.roomName) {
        keepSearchingRef.current = false;
        await navigateToRoom(token, data.match);
        return;
      }

      // If not yet mutually matched, keep polling
      setStatus("Waiting for mutual match...");
      keepSearchingRef.current = true;

      while (keepSearchingRef.current) {
        await wait(2000);
        if (!keepSearchingRef.current) break;

        const pollRes = await fetch(`${apiUrl}/api/events/poll`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!pollRes.ok) continue;
        const pollData = await pollRes.json();

        if (pollData.activeMatch?.roomName) {
          keepSearchingRef.current = false;
          await navigateToRoom(token, pollData.activeMatch);
          return;
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Accept failed");
      setStatus("Idle");
      setIsSearching(false);
    }
  };

  const navigateToRoom = async (token: string, match: MatchInfo) => {
    setStatus("Match found! Joining room...");
    router.push(`/room/${encodeURIComponent(match.roomName)}?matchId=${match.id}`);
  };

  const handleCancel = async () => {
    keepSearchingRef.current = false;
    setIsSearching(false);
    setCandidate(null);
    setStatus("Idle");

    const token = await getToken();
    if (token) {
      await fetch(`${apiUrl}/api/matchmaking/queue/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
  };

  return (
    <main>
      <section className="card stack">
        <h1>Lobby</h1>
        <p className="small">
          Click Start Chat and we will match you with one other online user.
          You must be signed in.
        </p>
        <p className="small">Status: {status}</p>
        {candidate && (
          <div className="card stack" style={{ background: "rgba(255,255,255,0.05)" }}>
            <p>Candidate: {candidate.fullName ?? "Anonymous"}</p>
            {candidate.bio && <p className="small">{candidate.bio}</p>}
          </div>
        )}
        {!isSearching && (
          <button className="btn btn-accent" onClick={handleStartChat}>
            Start Chat
          </button>
        )}
        {isSearching && (
          <button className="btn" onClick={handleCancel}>
            Cancel
          </button>
        )}
        {error && <p className="small" style={{ color: "#ff6b6b" }}>{error}</p>}
      </section>
    </main>
  );
}
