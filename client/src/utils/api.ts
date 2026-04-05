import { createClient as createSupabaseClient } from "./supabase/client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type PresenceStatus =
  | "offline"
  | "online_idle"
  | "queueing"
  | "browsing_candidates"
  | "waiting_for_mutual_accept"
  | "matched_pending_room"
  | "joining_room"
  | "in_call";

export type Candidate = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  age: number | null;
  country: string | null;
  status: PresenceStatus;
  isOnline: boolean;
};

export type Presence = {
  userId: string;
  status: PresenceStatus;
  isOnline: boolean;
  currentMatchId: string | null;
  currentRoomName: string | null;
  updatedAt: string;
};

export type MatchSummary = {
  id: string;
  userAId: string;
  userBId: string;
  status: string;
  matchedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  roomName: string;
  peer: Candidate | null;
};

export type ProfileState = {
  profile: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    age: number | null;
    country: string | null;
    isProfileComplete: boolean;
  };
  presence: Presence;
  activeMatch: MatchSummary | null;
};

export async function getAccessToken() {
  const supabase = createSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY."
    );
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You are not signed in.");
  }

  return session.access_token;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers
  });

  const payload = await response.json().catch(() => ({ message: "" }));
  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload as T;
}
