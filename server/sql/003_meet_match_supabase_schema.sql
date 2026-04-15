create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
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

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null check (
    status in (
      'offline',
      'online_idle',
      'queueing',
      'browsing_candidates',
      'waiting_for_mutual_accept',
      'matched_pending_room',
      'joining_room',
      'in_call'
    )
  ),
  is_online boolean not null default false,
  last_seen_at timestamptz not null default now(),
  current_match_id uuid,
  current_room_name text,
  keep_chatting boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_actions (
  id bigserial primary key,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('accept', 'reject', 'block', 'report')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_candidate_actions_actor
  on public.candidate_actions (actor_user_id);

create index if not exists idx_candidate_actions_target
  on public.candidate_actions (target_user_id);

create index if not exists idx_candidate_actions_actor_target_action
  on public.candidate_actions (actor_user_id, target_user_id, action);

create table if not exists public.active_matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (
    status in (
      'proposed',
      'mutual_match_found',
      'room_creating',
      'joining_room',
      'in_progress',
      'ending',
      'ended',
      'failed'
    )
  ),
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
  on public.active_matches (room_name)
  where room_name is not null;

create table if not exists public.match_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reserved_for_match_id uuid not null references public.active_matches(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_match_reservations_user_id
  on public.match_reservations (user_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  active_match_id uuid references public.active_matches(id) on delete set null,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  reviewed boolean not null default false
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_user_id, blocked_user_id)
);

create table if not exists public.seen_candidates (
  id uuid primary key default gen_random_uuid(),
  viewer_user_id uuid not null references public.profiles(id) on delete cascade,
  candidate_user_id uuid not null references public.profiles(id) on delete cascade,
  last_shown_at timestamptz not null default now(),
  shown_count int not null default 1,
  unique (viewer_user_id, candidate_user_id)
);

create table if not exists public.livekit_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  room_name text,
  participant_identity text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_presence enable row level security;
alter table public.candidate_actions enable row level security;
alter table public.active_matches enable row level security;
alter table public.match_reservations enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.seen_candidates enable row level security;

create policy "profiles are publicly readable"
  on public.profiles
  for select
  using (true);

create policy "users update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

create policy "users insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "users read own presence"
  on public.user_presence
  for select
  using (auth.uid() = user_id);

create policy "users update own presence"
  on public.user_presence
  for update
  using (auth.uid() = user_id);

create policy "users insert own presence"
  on public.user_presence
  for insert
  with check (auth.uid() = user_id);

create policy "users insert own candidate actions"
  on public.candidate_actions
  for insert
  with check (auth.uid() = actor_user_id);

create policy "users read own candidate actions"
  on public.candidate_actions
  for select
  using (auth.uid() = actor_user_id);

create policy "participants read own matches"
  on public.active_matches
  for select
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

create policy "users create own reports"
  on public.reports
  for insert
  with check (auth.uid() = reporter_user_id);

create policy "users read own reports"
  on public.reports
  for select
  using (auth.uid() = reporter_user_id);

create policy "users manage own blocks"
  on public.blocks
  for all
  using (auth.uid() = blocker_user_id)
  with check (auth.uid() = blocker_user_id);

create policy "users manage own seen candidates"
  on public.seen_candidates
  for all
  using (auth.uid() = viewer_user_id)
  with check (auth.uid() = viewer_user_id);
