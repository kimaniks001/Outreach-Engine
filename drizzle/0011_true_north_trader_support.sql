DO $$ BEGIN
  CREATE TYPE support_message_actor AS ENUM ('TRADER','STAFF','SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE support_case_state AS ENUM ('OPEN','WAITING_ON_TRADER','WAITING_INTERNAL','RESOLVED','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE support_resolution_kind AS ENUM ('HUMAN','AUTHORITATIVE_CONTEXT','GUIDED_ACTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS trader_support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  securepay_identity_ref text NOT NULL UNIQUE,
  display_label text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by_user_id uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS trader_support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES trader_support_conversations(id) ON DELETE CASCADE,
  actor_type support_message_actor NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 6000),
  source_kind text,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((actor_type = 'STAFF' AND actor_user_id IS NOT NULL) OR actor_type <> 'STAFF')
);
CREATE INDEX IF NOT EXISTS trader_support_messages_conversation_created_idx ON trader_support_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS trader_support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES trader_support_conversations(id),
  work_item_id uuid NOT NULL UNIQUE REFERENCES work_items(id),
  state support_case_state NOT NULL DEFAULT 'OPEN',
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 2 AND 180),
  resolution_summary text,
  resolution_kind support_resolution_kind,
  authoritative_source_ref text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS trader_support_cases_conversation_idx ON trader_support_cases(conversation_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS trader_support_case_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES trader_support_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trader_support_case_history_case_created_idx ON trader_support_case_history(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trader_friction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES trader_support_cases(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 80),
  detail text NOT NULL CHECK (char_length(detail) BETWEEN 2 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trader_friction_events_category_idx ON trader_friction_events(category, created_at DESC);
