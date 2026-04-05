# Meet Match

Meet Match is a mobile-first random 1-to-1 video chat MVP with:

- Supabase Google sign-in on the client
- an Express matchmaking API that validates Supabase access tokens server-side
- Postgres-backed queue, actions, reservations, and active match state
- mutual accept matching before video starts
- LiveKit room token issuance for matched pairs
- server-sent event push updates for queue refresh, match found, and call ended
- LiveKit webhook ingestion for room lifecycle cleanup
- block/report controls and queue return after a call ends

## Current implementation

The running app in this repo uses:

- `client/` for the Next.js app
- `server/` for the protected matchmaking and LiveKit token APIs
- database-backed matchmaking state on the server

The brief also required Supabase schema and RLS deliverables, so the intended database contract lives in:

- `server/sql/003_meet_match_supabase_schema.sql`

That SQL is the production-shaped Supabase schema the running server now expects.

## Local setup

### 1. Client env

`client/.env.local`

```sh
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```

### 2. Server env

`server/.env`

```sh
PORT=8000
WEB_ORIGIN=http://localhost:3000
DATABASE_URL=postgres://...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=...
```

### 3. Install

```sh
cd server && npm install
cd ../client && npm install
```

### 4. Run

```sh
cd server && npm start
cd ../client && npm run dev
```

## Product flow

1. User signs in with Google on `/`
2. `/dashboard` loads the synced profile summary from the server
3. `/lobby` requests camera/mic, enters the queue, and shows candidate profiles one at a time
4. Accept stores interest, reject skips, block/report suppress future matches
5. When two users accept each other, the server creates exactly one match and both clients transition to `/room/[matchId]`
6. Queue refreshes, mutual matches, and call endings are pushed to clients over `/api/events`
7. The room page requests a LiveKit token from the server, joins the room, and can end by button or left swipe
8. LiveKit can call `/api/webhooks/livekit` so unexpected room exits also clean up server state
9. Ending the call returns users to the matching flow

## Server API

- `GET /api/profile/me`
- `POST /api/profile/sync`
- `GET /api/events`
- `POST /api/matchmaking/queue/enter`
- `POST /api/matchmaking/queue/leave`
- `GET /api/matchmaking/candidate/next`
- `POST /api/matchmaking/candidate/action`
- `GET /api/matchmaking/status`
- `POST /api/matchmaking/room/join`
- `POST /api/matchmaking/call/end`
- `POST /api/webhooks/livekit`

## Production next steps

- Replace the Express persistence layer with Supabase Edge Functions or Postgres RPC if you want all authoritative logic to live inside Supabase itself
- Replace SSE with Supabase Realtime if you want managed multi-instance fanout
- Add rate limiting and moderation review tooling
- Replace placeholder profile defaults with editable profile settings

## Deployment

### Vercel

Deploy the Next.js app from `client/`.

Required client env vars:

```sh
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
NEXT_PUBLIC_API_URL=https://your-render-api.onrender.com
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-host
```

There is a checked-in config at `client/vercel.json`.

### Render

Deploy the Express API from `server/`.

Required server env vars:

```sh
WEB_ORIGIN=https://your-vercel-app.vercel.app
DATABASE_URL=postgres://...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

There is a checked-in Blueprint config at `render.yaml`. The API exposes `GET /health`, which Render can use as the health check.

## Test checklist

- Google sign-in succeeds and redirects to `/dashboard`
- `/dashboard` shows the synced profile
- Starting chat requests camera and microphone permissions
- Two signed-in users can browse candidates and reach a mutual match
- Reject immediately advances to the next candidate or waiting state
- Block prevents the same user from appearing again
- Report succeeds without breaking queue flow
- A matched user cannot join a room they do not belong to
- Ending a call returns the user to `/lobby?ended=1`
- Queue refreshes and mutual matches arrive without client polling
- LiveKit webhook callbacks can end stale calls server-side
- `npm run build` passes in `client`
