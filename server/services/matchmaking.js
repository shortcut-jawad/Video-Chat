import crypto from "crypto";
import { query, withTransaction } from "../db.js";

const REJECT_COOLDOWN_HOURS = 24;
const RECENT_SEEN_MINUTES = 10;
const RESERVATION_TTL_SECONDS = 30;
const ALLOWED_ACTIONS = new Set(["accept", "reject", "block", "report"]);

function buildCandidate(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    age: row.age,
    country: row.country,
    status: row.status,
    isOnline: row.is_online
  };
}

function buildPresence(row) {
  return {
    userId: row.user_id,
    status: row.status,
    isOnline: row.is_online,
    currentMatchId: row.current_match_id,
    currentRoomName: row.current_room_name,
    updatedAt: row.updated_at
  };
}

async function getProfileRow(client, user) {
  const { rows } = await client.query(
    `
      insert into profiles (id, full_name, avatar_url, bio, is_profile_complete)
      values ($1, $2, $3, $4, true)
      on conflict (id) do update
        set full_name = coalesce(excluded.full_name, profiles.full_name),
            avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
            updated_at = now()
      returning *
    `,
    [
      user.id,
      user.name,
      user.avatarUrl,
      "Open to spontaneous one-on-one video chats."
    ]
  );

  return rows[0];
}

async function getPresenceRow(client, userId) {
  const { rows } = await client.query(
    `
      insert into user_presence (user_id, status, is_online, keep_chatting)
      values ($1, 'online_idle', true, false)
      on conflict (user_id) do update
        set is_online = true,
            last_seen_at = now(),
            updated_at = now()
      returning *
    `,
    [userId]
  );

  return rows[0];
}

async function ensureProfileState(client, user) {
  const profile = await getProfileRow(client, user);
  const presence = await getPresenceRow(client, user.id);
  return { profile, presence };
}

async function getActiveMatch(client, userId) {
  const { rows } = await client.query(
    `
      select *
      from active_matches
      where ended_at is null
        and status not in ('ended', 'failed')
        and (user_a_id = $1 or user_b_id = $1)
      order by matched_at desc
      limit 1
    `,
    [userId]
  );

  return rows[0] ?? null;
}

async function getPeerCandidate(client, match, userId) {
  const peerId = match.user_a_id === userId ? match.user_b_id : match.user_a_id;
  const { rows } = await client.query(
    `
      select
        p.id,
        p.full_name,
        p.avatar_url,
        p.bio,
        p.age,
        p.country,
        up.status,
        up.is_online
      from profiles p
      join user_presence up on up.user_id = p.id
      where p.id = $1
      limit 1
    `,
    [peerId]
  );

  return buildCandidate(rows[0] ?? null);
}

async function getViewerStateInternal(client, user) {
  const { profile, presence } = await ensureProfileState(client, user);
  const activeMatch = await getActiveMatch(client, user.id);

  return {
    profile: {
      id: profile.id,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      age: profile.age,
      country: profile.country,
      isProfileComplete: profile.is_profile_complete
    },
    presence: buildPresence(presence),
    activeMatch: activeMatch
      ? {
          id: activeMatch.id,
          userAId: activeMatch.user_a_id,
          userBId: activeMatch.user_b_id,
          status: activeMatch.status,
          matchedAt: activeMatch.matched_at,
          startedAt: activeMatch.started_at,
          endedAt: activeMatch.ended_at,
          endReason: activeMatch.end_reason,
          roomName: activeMatch.room_name,
          peer: await getPeerCandidate(client, activeMatch, user.id)
        }
      : null
  };
}

async function fetchNextCandidate(client, userId) {
  const { rows } = await client.query(
    `
      with recent_rejects as (
        select target_user_id, max(created_at) as rejected_at
        from candidate_actions
        where actor_user_id = $1
          and action = 'reject'
        group by target_user_id
      ),
      active_users as (
        select distinct unnest(array[user_a_id, user_b_id]) as user_id
        from active_matches
        where ended_at is null
          and status not in ('ended', 'failed')
      )
      select
        p.id,
        p.full_name,
        p.avatar_url,
        p.bio,
        p.age,
        p.country,
        up.status,
        up.is_online,
        sc.last_shown_at
      from profiles p
      join user_presence up on up.user_id = p.id
      left join blocks b1
        on b1.blocker_user_id = $1 and b1.blocked_user_id = p.id
      left join blocks b2
        on b2.blocker_user_id = p.id and b2.blocked_user_id = $1
      left join recent_rejects rr
        on rr.target_user_id = p.id
      left join seen_candidates sc
        on sc.viewer_user_id = $1 and sc.candidate_user_id = p.id
      left join match_reservations mr
        on mr.user_id = p.id and mr.expires_at > now()
      left join active_users au
        on au.user_id = p.id
      where p.id <> $1
        and up.is_online = true
        and up.status in ('queueing', 'browsing_candidates', 'waiting_for_mutual_accept')
        and b1.id is null
        and b2.id is null
        and mr.id is null
        and au.user_id is null
        and (
          rr.rejected_at is null or
          rr.rejected_at < now() - make_interval(hours => $2)
        )
      order by
        case
          when sc.last_shown_at is null then 0
          when sc.last_shown_at < now() - make_interval(mins => $3) then 0
          else 1
        end,
        sc.last_shown_at nulls first,
        random()
      limit 1
    `,
    [userId, REJECT_COOLDOWN_HOURS, RECENT_SEEN_MINUTES]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  await client.query(
    `
      insert into seen_candidates (viewer_user_id, candidate_user_id, last_shown_at, shown_count)
      values ($1, $2, now(), 1)
      on conflict (viewer_user_id, candidate_user_id) do update
        set last_shown_at = now(),
            shown_count = seen_candidates.shown_count + 1
    `,
    [userId, row.id]
  );

  return buildCandidate(row);
}

const ALLOWED_PRESENCE_COLUMNS = new Set([
  "status",
  "is_online",
  "current_match_id",
  "current_room_name",
  "keep_chatting"
]);

async function updatePresence(client, userId, patch) {
  const fields = [];
  const values = [];
  let index = 1;

  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_PRESENCE_COLUMNS.has(key)) {
      throw new Error(`Invalid presence column: ${key}`);
    }
    fields.push(`${key} = $${index}`);
    values.push(value);
    index += 1;
  }

  if (fields.length === 0) {
    return null;
  }

  values.push(userId);
  const { rows } = await client.query(
    `
      update user_presence
      set ${fields.join(", ")},
          updated_at = now(),
          last_seen_at = now()
      where user_id = $${index}
      returning *
    `,
    values
  );

  return rows[0];
}

export async function syncProfile(user) {
  return withTransaction((client) => getViewerStateInternal(client, user));
}

export async function getViewerState(user) {
  return withTransaction((client) => getViewerStateInternal(client, user));
}

export async function enterQueue(user, keepChatting = true) {
  return withTransaction(async (client) => {
    await ensureProfileState(client, user);

    const activeMatch = await getActiveMatch(client, user.id);
    if (activeMatch) {
      return {
        status: "match_found",
        match: {
          id: activeMatch.id,
          userAId: activeMatch.user_a_id,
          userBId: activeMatch.user_b_id,
          status: activeMatch.status,
          matchedAt: activeMatch.matched_at,
          startedAt: activeMatch.started_at,
          endedAt: activeMatch.ended_at,
          endReason: activeMatch.end_reason,
          roomName: activeMatch.room_name,
          peer: await getPeerCandidate(client, activeMatch, user.id)
        }
      };
    }

    await client.query(
      `delete from match_reservations where user_id = $1 and expires_at <= now()`,
      [user.id]
    );

    await updatePresence(client, user.id, {
      status: "queueing",
      is_online: true,
      current_match_id: null,
      current_room_name: null,
      keep_chatting: keepChatting
    });

    const candidate = await fetchNextCandidate(client, user.id);
    if (!candidate) {
      return { status: "waiting", candidate: null };
    }

    await updatePresence(client, user.id, {
      status: "browsing_candidates"
    });

    return { status: "candidate_ready", candidate };
  });
}

export async function leaveQueue(user) {
  return withTransaction(async (client) => {
    await ensureProfileState(client, user);
    await updatePresence(client, user.id, {
      status: "online_idle",
      current_match_id: null,
      current_room_name: null,
      keep_chatting: false
    });

    return { status: "left_queue" };
  });
}

export async function getNextCandidate(user) {
  return withTransaction(async (client) => {
    await ensureProfileState(client, user);

    const activeMatch = await getActiveMatch(client, user.id);
    if (activeMatch) {
      return {
        status: "match_found",
        match: {
          id: activeMatch.id,
          userAId: activeMatch.user_a_id,
          userBId: activeMatch.user_b_id,
          status: activeMatch.status,
          matchedAt: activeMatch.matched_at,
          startedAt: activeMatch.started_at,
          endedAt: activeMatch.ended_at,
          endReason: activeMatch.end_reason,
          roomName: activeMatch.room_name,
          peer: await getPeerCandidate(client, activeMatch, user.id)
        }
      };
    }

    const candidate = await fetchNextCandidate(client, user.id);
    if (!candidate) {
      await updatePresence(client, user.id, {
        status: "queueing",
        current_match_id: null,
        current_room_name: null
      });
      return { status: "waiting", candidate: null };
    }

    await updatePresence(client, user.id, {
      status: "browsing_candidates"
    });

    return { status: "candidate_ready", candidate };
  });
}

async function buildMatchResponse(client, match, userId) {
  return {
    id: match.id,
    userAId: match.user_a_id,
    userBId: match.user_b_id,
    status: match.status,
    matchedAt: match.matched_at,
    startedAt: match.started_at,
    endedAt: match.ended_at,
    endReason: match.end_reason,
    roomName: match.room_name,
    peer: await getPeerCandidate(client, match, userId)
  };
}

export async function submitCandidateAction(user, targetUserId, action, reason = null) {
  return withTransaction(async (client) => {
    await ensureProfileState(client, user);

    if (!ALLOWED_ACTIONS.has(action)) {
      return { status: "invalid_action" };
    }

    const { rows: targetRows } = await client.query(
      `select id from profiles where id = $1 limit 1`,
      [targetUserId]
    );
    if (!targetRows[0] || targetUserId === user.id) {
      return { status: "candidate_unavailable", candidate: null };
    }

    await client.query(
      `
        insert into candidate_actions (actor_user_id, target_user_id, action, reason)
        values ($1, $2, $3, $4)
      `,
      [user.id, targetUserId, action, reason]
    );

    if (action === "block") {
      await client.query(
        `
          insert into blocks (blocker_user_id, blocked_user_id)
          values ($1, $2)
          on conflict (blocker_user_id, blocked_user_id) do nothing
        `,
        [user.id, targetUserId]
      );

      const candidate = await fetchNextCandidate(client, user.id);
      return { status: "blocked", candidate };
    }

    if (action === "report") {
      const activeMatch = await getActiveMatch(client, user.id);
      await client.query(
        `
          insert into reports (reporter_user_id, target_user_id, active_match_id, reason)
          values ($1, $2, $3, $4)
        `,
        [user.id, targetUserId, activeMatch?.id ?? null, reason ?? "Reported"]
      );

      const candidate = await fetchNextCandidate(client, user.id);
      return { status: "reported", candidate };
    }

    if (action === "reject") {
      const candidate = await fetchNextCandidate(client, user.id);
      if (candidate) {
        await updatePresence(client, user.id, { status: "browsing_candidates" });
      }
      return { status: "rejected", candidate };
    }

    const { rows: reciprocalRows } = await client.query(
      `
        select id
        from candidate_actions
        where actor_user_id = $1
          and target_user_id = $2
          and action = 'accept'
        order by created_at desc
        limit 1
      `,
      [targetUserId, user.id]
    );

    if (!reciprocalRows[0]) {
      await updatePresence(client, user.id, { status: "waiting_for_mutual_accept" });
      const candidate = await fetchNextCandidate(client, user.id);
      if (candidate) {
        await updatePresence(client, user.id, { status: "browsing_candidates" });
      }
      return { status: "accepted_waiting", candidate };
    }

    await client.query(`delete from match_reservations where expires_at <= now()`);
    const { rows: lockedPresenceRows } = await client.query(
      `
        select *
        from user_presence
        where user_id = any($1::uuid[])
        for update
      `,
      [[user.id, targetUserId]]
    );

    if (lockedPresenceRows.length !== 2) {
      const candidate = await fetchNextCandidate(client, user.id);
      return { status: "race_lost", candidate };
    }

    const { rows: activeRows } = await client.query(
      `
        select id
        from active_matches
        where ended_at is null
          and status not in ('ended', 'failed')
          and (
            user_a_id = any($1::uuid[]) or
            user_b_id = any($1::uuid[])
          )
        limit 1
      `,
      [[user.id, targetUserId]]
    );

    if (activeRows[0]) {
      const candidate = await fetchNextCandidate(client, user.id);
      return { status: "race_lost", candidate };
    }

    const roomName = `match_${crypto.randomUUID()}`;
    const { rows: matchRows } = await client.query(
      `
        insert into active_matches (user_a_id, user_b_id, status, room_name, provider, created_by)
        values ($1, $2, 'mutual_match_found', $3, 'livekit', 'system')
        returning *
      `,
      [user.id, targetUserId, roomName]
    );
    const match = matchRows[0];

    const { rows: reservationRows } = await client.query(
      `
        insert into match_reservations (user_id, reserved_for_match_id, expires_at)
        values
          ($1, $3, now() + make_interval(secs => $4)),
          ($2, $3, now() + make_interval(secs => $4))
        on conflict (user_id) do nothing
        returning user_id
      `,
      [user.id, targetUserId, match.id, RESERVATION_TTL_SECONDS]
    );

    if (reservationRows.length !== 2) {
      await client.query(`delete from active_matches where id = $1`, [match.id]);
      const candidate = await fetchNextCandidate(client, user.id);
      return { status: "race_lost", candidate };
    }

    await client.query(
      `
        update user_presence
        set status = 'matched_pending_room',
            current_match_id = $3,
            current_room_name = $4,
            keep_chatting = true,
            last_seen_at = now(),
            updated_at = now()
        where user_id in ($1, $2)
      `,
      [user.id, targetUserId, match.id, roomName]
    );

    return {
      status: "match_found",
      match: await buildMatchResponse(client, match, user.id)
    };
  });
}

export async function getStatus(user) {
  return withTransaction(async (client) => {
    await ensureProfileState(client, user);
    const { rows } = await client.query(
      `select * from user_presence where user_id = $1 limit 1`,
      [user.id]
    );
    const activeMatch = await getActiveMatch(client, user.id);

    return {
      presence: buildPresence(rows[0]),
      activeMatch: activeMatch ? await buildMatchResponse(client, activeMatch, user.id) : null
    };
  });
}

export async function getRoomAccess(user, matchId) {
  return withTransaction(async (client) => {
    await ensureProfileState(client, user);
    const { rows } = await client.query(
      `
        select *
        from active_matches
        where id = $1
          and (user_a_id = $2 or user_b_id = $2)
          and ended_at is null
        limit 1
      `,
      [matchId, user.id]
    );

    const match = rows[0];
    if (!match) {
      return null;
    }

    await updatePresence(client, user.id, {
      status: "joining_room",
      current_match_id: match.id,
      current_room_name: match.room_name
    });

    return {
      matchId: match.id,
      roomName: match.room_name,
      peer: await getPeerCandidate(client, match, user.id)
    };
  });
}

export async function markMatchJoined(user, matchId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `
        update active_matches
        set status = 'in_progress',
            started_at = coalesce(started_at, now())
        where id = $1
          and (user_a_id = $2 or user_b_id = $2)
        returning *
      `,
      [matchId, user.id]
    );
    const match = rows[0];
    if (!match) {
      return null;
    }

    await updatePresence(client, user.id, {
      status: "in_call",
      current_match_id: match.id,
      current_room_name: match.room_name
    });

    return buildMatchResponse(client, match, user.id);
  });
}

export async function endMatch(user, matchId, endReason = "ended_by_user") {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `
        select *
        from active_matches
        where id = $1
          and (user_a_id = $2 or user_b_id = $2)
        for update
      `,
      [matchId, user.id]
    );
    const match = rows[0];
    if (!match) {
      return null;
    }

    await client.query(
      `
        update active_matches
        set status = 'ended',
            ended_at = coalesce(ended_at, now()),
            end_reason = coalesce(end_reason, $2)
        where id = $1
      `,
      [match.id, endReason]
    );

    await client.query(`delete from match_reservations where reserved_for_match_id = $1`, [
      match.id
    ]);

    const { rows: presenceRows } = await client.query(
      `
        select user_id, keep_chatting
        from user_presence
        where user_id in ($1, $2)
      `,
      [match.user_a_id, match.user_b_id]
    );

    for (const presence of presenceRows) {
      await updatePresence(client, presence.user_id, {
        status: presence.keep_chatting ? "queueing" : "online_idle",
        current_match_id: null,
        current_room_name: null
      });
    }

    return {
      id: match.id,
      userAId: match.user_a_id,
      userBId: match.user_b_id,
      status: "ended",
      matchedAt: match.matched_at,
      startedAt: match.started_at,
      endedAt: new Date().toISOString(),
      endReason,
      roomName: match.room_name,
      peer: await getPeerCandidate(client, match, user.id)
    };
  });
}

export async function recordLiveKitWebhook(event) {
  return withTransaction(async (client) => {
    const payload = JSON.stringify(event);
    await client.query(
      `
        insert into livekit_webhook_events (event_type, room_name, participant_identity, payload)
        values ($1, $2, $3, $4::jsonb)
      `,
      [event.event, event.room?.name ?? null, event.participant?.identity ?? null, payload]
    );

    if (
      !["participant_left", "participant_connection_aborted", "room_finished"].includes(
        event.event
      )
    ) {
      return null;
    }

    const roomName = event.room?.name;
    if (!roomName) {
      return null;
    }

    const { rows } = await client.query(
      `
        select *
        from active_matches
        where room_name = $1
          and ended_at is null
        limit 1
      `,
      [roomName]
    );
    const match = rows[0];
    if (!match) {
      return null;
    }

    await client.query(
      `
        update active_matches
        set status = 'ended',
            ended_at = coalesce(ended_at, now()),
            end_reason = coalesce(end_reason, $2)
        where id = $1
      `,
      [match.id, event.event]
    );

    await client.query(`delete from match_reservations where reserved_for_match_id = $1`, [
      match.id
    ]);

    await client.query(
      `
        update user_presence
        set status = case when keep_chatting then 'queueing' else 'online_idle' end,
            current_match_id = null,
            current_room_name = null,
            updated_at = now(),
            last_seen_at = now()
        where user_id in ($1, $2)
      `,
      [match.user_a_id, match.user_b_id]
    );

    return {
      userIds: [match.user_a_id, match.user_b_id],
      matchId: match.id,
      roomName: match.room_name,
      reason: event.event
    };
  });
}

export async function getDevSnapshot() {
  const [profiles, presence, matches, reports, blocks, seen] = await Promise.all([
    query(`select * from profiles order by created_at desc`),
    query(`select * from user_presence order by updated_at desc`),
    query(`select * from active_matches order by matched_at desc`),
    query(`select * from reports order by created_at desc`),
    query(`select * from blocks order by created_at desc`),
    query(`select * from seen_candidates order by last_shown_at desc`)
  ]);

  return {
    profiles: profiles.rows,
    presences: presence.rows,
    matches: matches.rows,
    reports: reports.rows,
    blocks: blocks.rows,
    seenCandidates: seen.rows
  };
}
