# VideoChat Auth + LiveKit Starter

This is a fresh scaffold for a video chat app with social login (Google, Facebook, Apple ID), JWT-based authorization, and LiveKit token issuance.

## Structure

- `client/` - Next.js front-end with sign-in + lobby flows
- `server/` - Express API handling OAuth, JWT, and LiveKit tokens

## Setup

### 1) Database
Create a PostgreSQL database and run the migration:

```sh
psql "$DATABASE_URL" -f server/sql/001_create_users.sql
psql "$DATABASE_URL" -f server/sql/002_add_matchmaking.sql
```

### 2) Server env
Copy and fill:

```sh
cp server/.env.example server/.env
```

### 3) Client env
Copy and fill:

```sh
cp client/.env.example client/.env
```

### 4) Install dependencies

```sh
cd server
npm install

cd ../client
npm install
```

### 5) Run

```sh
cd server
npm run dev

cd ../client
npm run dev
```

## OAuth Provider Notes

### Google
- Create OAuth client in Google Cloud Console
- Add redirect URL: `http://localhost:8000/auth/google/callback`
- Add origin: `http://localhost:3000`

### Facebook
- Create Facebook app and enable Facebook Login
- Add redirect URL: `http://localhost:8000/auth/facebook/callback`

### Apple
- Enable "Sign in with Apple"
- Configure services ID + private key
- Callback URL: `http://localhost:8000/auth/apple/callback`

## VideoChat Flow

1. User signs in via social login
2. Server issues JWT in HTTP-only cookie `vc_token`
3. User clicks `Start Chat` in `/lobby`
4. Backend pairs two waiting users using PostgreSQL-backed queue
5. Frontend opens `/room/[roomName]`, requests token, and joins via LiveKit SDK

## API Endpoints

- `GET /auth/google`
- `GET /auth/facebook`
- `GET /auth/apple`
- `GET /auth/google/callback`
- `GET /auth/facebook/callback`
- `POST /auth/apple/callback`
- `GET /me`
- `POST /api/rooms/start`
- `POST /api/rooms/cancel`
- `POST /api/rooms/token`
- `GET /auth/logout`
