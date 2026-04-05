"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  type Candidate,
  type MatchSummary,
  type Presence,
  type ProfileState
} from "../../utils/api";
import { useServerEvents } from "../../utils/useServerEvents";

export default function LobbyPage() {
  const router = useRouter();
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("Idle");
  const [error, setError] = useState<string | null>(null);

  const handleResult = (
    result:
      | { status?: string; candidate?: Candidate | null; match?: MatchSummary | null }
      | ProfileState
  ) => {
    if ("profile" in result) {
      setProfileState(result);
      setPresence(result.presence);
      if (result.activeMatch) {
        router.push(`/room/${encodeURIComponent(result.activeMatch.id)}`);
      }
      return;
    }

    if (result.match) {
      setCandidate(null);
      setMessage("Mutual match found. Joining room...");
      router.push(`/room/${encodeURIComponent(result.match.id)}`);
      return;
    }

    setCandidate(result.candidate ?? null);

    switch (result.status) {
      case "candidate_ready":
        setMessage("Choose accept or reject.");
        break;
      case "accepted_waiting":
        setMessage("Interest sent. Browsing other candidates.");
        break;
      case "waiting":
        setMessage("No candidates are free right now. Waiting for someone new.");
        break;
      case "blocked":
        setMessage("User blocked. They will not appear again.");
        break;
      case "reported":
        setMessage("Report submitted.");
        break;
      case "rejected":
        setMessage("Skipped. Looking for the next person.");
        break;
      case "race_lost":
        setMessage("That person got matched first. Loading another candidate.");
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const state = await apiFetch<ProfileState>("/api/profile/me");
        handleResult(state);
        if (
          ["queueing", "browsing_candidates", "waiting_for_mutual_accept"].includes(
            state.presence.status
          )
        ) {
          setIsSearching(true);
          const next = await apiFetch<{ status: string; candidate: Candidate | null }>(
            "/api/matchmaking/candidate/next"
          );
          handleResult(next);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load lobby");
      } finally {
        setIsLoading(false);
      }
    };

    const params = new URLSearchParams(window.location.search);
    if (params.get("ended") === "1") {
      setMessage("Call ended. You are back in the queue.");
    }

    void boot();
  }, [router]);

  const eventHandlers = useMemo(
    () => ({
      MUTUAL_MATCH_FOUND: (payload: unknown) => {
        const match = payload as MatchSummary;
        setMessage("Mutual match found. Joining room...");
        router.push(`/room/${encodeURIComponent(match.id)}`);
      },
      CALL_ENDED: () => {
        setCandidate(null);
        setIsSearching(true);
        setMessage("Call ended. You are back in the queue.");
      },
      QUEUE_REFRESH: async () => {
        if (!isSearching || candidate) {
          return;
        }
        try {
          const next = await apiFetch<{ status: string; candidate: Candidate | null }>(
            "/api/matchmaking/candidate/next"
          );
          handleResult(next);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Failed to refresh queue");
        }
      }
    }),
    [candidate, isSearching, router]
  );

  useServerEvents(eventHandlers);

  const requestPermissions = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    stream.getTracks().forEach((track) => track.stop());
  };

  const handleStartChat = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await requestPermissions();
      const result = await apiFetch<{ status: string; candidate: Candidate | null; match?: MatchSummary }>(
        "/api/matchmaking/queue/enter",
        {
          method: "POST",
          body: JSON.stringify({ keepChatting: true })
        }
      );

      setIsSearching(true);
      handleResult(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to start chat");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      await apiFetch("/api/matchmaking/queue/leave", {
        method: "POST"
      });
      setIsSearching(false);
      setCandidate(null);
      setMessage("Idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to leave queue");
    }
  };

  const handleAction = async (action: "accept" | "reject" | "block" | "report") => {
    if (!candidate) {
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const reason =
        action === "report"
          ? window.prompt("Report reason", "Inappropriate behavior") ?? "Reported"
          : null;
      const result = await apiFetch<{
        status: string;
        candidate?: Candidate | null;
        match?: MatchSummary | null;
      }>("/api/matchmaking/candidate/action", {
          method: "POST",
          body: JSON.stringify({
            targetUserId: candidate.id,
            action,
            reason
          })
        });
      handleResult(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to submit action");
    }
  };

  return (
    <main>
      <div className="shell">
        <section className="card stack">
          <span className="eyebrow">Meet Match</span>
          <h1>Lobby</h1>
          <p className="small">
            Browse people one by one. A call only begins when both sides accept
            each other.
          </p>
          <div className="grid-2">
            <div className="card stack">
              <span className="label">Your status</span>
              <span className="status-pill">{presence?.status ?? "online_idle"}</span>
              <p className="small">{message}</p>
              {!isSearching && (
                <button className="btn btn-accent" onClick={handleStartChat} disabled={isLoading}>
                  {isLoading ? "Preparing..." : "Start Chat"}
                </button>
              )}
              {isSearching && (
                <button className="btn btn-ghost" onClick={handleCancel}>
                  Leave Queue
                </button>
              )}
              <Link className="btn" href="/dashboard">
                Back Home
              </Link>
            </div>
            <div className="card stack candidate-card">
              <span className="label">Candidate</span>
              {!candidate && (
                <div className="stack">
                  <p className="value">Waiting for the next profile</p>
                  <p className="small">
                    Keep the queue open and new available users will appear here.
                  </p>
                </div>
              )}
              {candidate && (
                <>
                  <div className="avatar-glow">
                    {candidate.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={candidate.fullName ?? "Candidate avatar"}
                        className="avatar"
                        src={candidate.avatarUrl}
                      />
                    ) : (
                      <div className="avatar avatar-fallback">
                        {(candidate.fullName ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="stack">
                    <p className="value">{candidate.fullName ?? "Mystery match"}</p>
                    <p className="small">{candidate.bio ?? "Open for a spontaneous call."}</p>
                    <span className="status-pill">
                      {candidate.isOnline ? "Online now" : "Recently active"}
                    </span>
                  </div>
                  <div className="grid-2">
                    <button className="btn btn-accent" onClick={() => handleAction("accept")}>
                      Accept
                    </button>
                    <button className="btn btn-ghost" onClick={() => handleAction("reject")}>
                      Reject
                    </button>
                    <button className="btn btn-ghost" onClick={() => handleAction("block")}>
                      Block
                    </button>
                    <button className="btn btn-ghost" onClick={() => handleAction("report")}>
                      Report
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {error && <p className="small error-text">{error}</p>}
        </section>
      </div>
    </main>
  );
}
