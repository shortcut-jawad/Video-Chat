CREATE TABLE IF NOT EXISTS chat_queue (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_queue_enqueued_at
  ON chat_queue (enqueued_at);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_name TEXT UNIQUE NOT NULL,
  user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CHECK (user1_id <> user2_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_active_user1
  ON chat_rooms (user1_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_rooms_active_user2
  ON chat_rooms (user2_id)
  WHERE ended_at IS NULL;
