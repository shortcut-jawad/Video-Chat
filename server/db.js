import pg from "pg";

const { Pool } = pg;
let schemaReady = false;
let schemaError = null;
let schemaInitPromise = null;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(run) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureSchema() {
  await query(`
    create extension if not exists "pgcrypto";

    create table if not exists profiles (
      id uuid primary key,
      username text unique,
      full_name text,
      avatar_url text,
      bio text,
      age int,
      country text,
      is_profile_complete boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists user_presence (
      user_id uuid primary key references profiles(id) on delete cascade,
      status text not null,
      is_online boolean not null default false,
      last_seen_at timestamptz not null default now(),
      current_match_id uuid,
      current_room_name text,
      keep_chatting boolean not null default false,
      updated_at timestamptz not null default now()
    );

    create table if not exists candidate_actions (
      id bigserial primary key,
      actor_user_id uuid not null references profiles(id) on delete cascade,
      target_user_id uuid not null references profiles(id) on delete cascade,
      action text not null,
      reason text,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_candidate_actions_actor
      on candidate_actions (actor_user_id);

    create index if not exists idx_candidate_actions_target
      on candidate_actions (target_user_id);

    create index if not exists idx_candidate_actions_actor_target_action
      on candidate_actions (actor_user_id, target_user_id, action);

    create table if not exists active_matches (
      id uuid primary key default gen_random_uuid(),
      user_a_id uuid not null references profiles(id) on delete cascade,
      user_b_id uuid not null references profiles(id) on delete cascade,
      status text not null,
      matched_at timestamptz not null default now(),
      started_at timestamptz,
      ended_at timestamptz,
      end_reason text,
      room_name text,
      provider text default 'livekit',
      created_by text default 'system',
      check (user_a_id <> user_b_id)
    );

    create unique index if not exists idx_active_matches_room_name
      on active_matches (room_name) where room_name is not null;

    create table if not exists match_reservations (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references profiles(id) on delete cascade,
      reserved_for_match_id uuid not null references active_matches(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create unique index if not exists idx_match_reservations_user
      on match_reservations (user_id);

    create table if not exists reports (
      id uuid primary key default gen_random_uuid(),
      reporter_user_id uuid not null references profiles(id) on delete cascade,
      target_user_id uuid not null references profiles(id) on delete cascade,
      active_match_id uuid references active_matches(id) on delete set null,
      reason text not null,
      details text,
      created_at timestamptz not null default now(),
      reviewed boolean not null default false
    );

    create table if not exists blocks (
      id uuid primary key default gen_random_uuid(),
      blocker_user_id uuid not null references profiles(id) on delete cascade,
      blocked_user_id uuid not null references profiles(id) on delete cascade,
      created_at timestamptz not null default now(),
      unique (blocker_user_id, blocked_user_id)
    );

    create table if not exists seen_candidates (
      id uuid primary key default gen_random_uuid(),
      viewer_user_id uuid not null references profiles(id) on delete cascade,
      candidate_user_id uuid not null references profiles(id) on delete cascade,
      last_shown_at timestamptz not null default now(),
      shown_count int not null default 1,
      unique (viewer_user_id, candidate_user_id)
    );

    create table if not exists livekit_webhook_events (
      id uuid primary key default gen_random_uuid(),
      event_type text not null,
      room_name text,
      participant_identity text,
      payload jsonb not null,
      created_at timestamptz not null default now()
    );

    create or replace function touch_updated_at()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;

    drop trigger if exists trg_profiles_updated_at on profiles;
    create trigger trg_profiles_updated_at
      before update on profiles
      for each row
      execute function touch_updated_at();

    drop trigger if exists trg_user_presence_updated_at on user_presence;
    create trigger trg_user_presence_updated_at
      before update on user_presence
      for each row
      execute function touch_updated_at();
  `);
}

export async function initializeDatabase() {
  if (schemaReady) {
    return;
  }

  if (!schemaInitPromise) {
    schemaInitPromise = ensureSchema()
      .then(() => {
        schemaReady = true;
        schemaError = null;
      })
      .catch((error) => {
        schemaReady = false;
        schemaError = error;
        throw error;
      })
      .finally(() => {
        schemaInitPromise = null;
      });
  }

  return schemaInitPromise;
}

export function getDatabaseStatus() {
  return {
    ready: schemaReady,
    initializing: schemaInitPromise !== null,
    error: schemaError
      ? {
          name: schemaError.name,
          message: schemaError.message,
          code: schemaError.code ?? null
        }
      : null
  };
}

export async function listQueueingUserIds(excludeUserIds = []) {
  const { rows } = await query(
    `
      select user_id
      from user_presence
      where is_online = true
        and status in ('queueing', 'browsing_candidates', 'waiting_for_mutual_accept')
        and not (user_id = any($1::uuid[]))
    `,
    [excludeUserIds]
  );

  return rows.map((row) => row.user_id);
}

export async function closePool() {
  await pool.end();
}
