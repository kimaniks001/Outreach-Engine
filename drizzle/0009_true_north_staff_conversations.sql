DO $$ BEGIN
  CREATE TYPE staff_conversation_type AS ENUM ('DIRECT', 'GROUP', 'STAFF_CIRCLE', 'COMPANY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_member_role AS ENUM ('OWNER', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_action_type AS ENUM ('TASK', 'CASE', 'INCIDENT', 'FOLLOW_UP', 'APPROVAL', 'KNOWLEDGE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS staff_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type staff_conversation_type NOT NULL,
  title TEXT,
  direct_key TEXT UNIQUE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_conversations_direct_shape CHECK (
    (type = 'DIRECT' AND direct_key IS NOT NULL)
    OR (type <> 'DIRECT' AND direct_key IS NULL)
  ),
  CONSTRAINT staff_conversations_named_shape CHECK (
    type = 'DIRECT' OR nullif(btrim(title), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_conversations_company_one_idx
  ON staff_conversations(type)
  WHERE type = 'COMPANY';

CREATE TABLE IF NOT EXISTS staff_conversation_members (
  conversation_id UUID NOT NULL REFERENCES staff_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role conversation_member_role NOT NULL DEFAULT 'MEMBER',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS staff_conversation_members_user_idx
  ON staff_conversation_members(user_id, conversation_id);

CREATE TABLE IF NOT EXISTS staff_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES staff_conversations(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  reply_to_message_id UUID REFERENCES staff_messages(id) ON DELETE SET NULL,
  attachment JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT staff_messages_content_check CHECK (
    nullif(btrim(body), '') IS NOT NULL OR attachment IS NOT NULL
  ),
  CONSTRAINT staff_messages_body_length_check CHECK (char_length(body) <= 8000)
);

CREATE INDEX IF NOT EXISTS staff_messages_conversation_time_idx
  ON staff_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS staff_messages_reply_idx
  ON staff_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS staff_message_reactions (
  message_id UUID NOT NULL REFERENCES staff_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji),
  CONSTRAINT staff_message_reactions_emoji_check CHECK (emoji IN ('👍', '❤️', '🎉', '👀', '✅'))
);

CREATE TABLE IF NOT EXISTS staff_message_pins (
  conversation_id UUID NOT NULL REFERENCES staff_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES staff_messages(id) ON DELETE CASCADE,
  pinned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE TABLE IF NOT EXISTS conversation_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES staff_conversations(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES staff_messages(id) ON DELETE SET NULL,
  action_type conversation_action_type NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_action_drafts_status_check CHECK (status = 'DRAFT')
);

CREATE INDEX IF NOT EXISTS conversation_action_drafts_conversation_idx
  ON conversation_action_drafts(conversation_id, created_at DESC);

COMMENT ON TABLE staff_conversations IS
  'Outreach-owned internal staff conversations. Must not be joined to or treated as SecurePay market Community authority.';

COMMENT ON TABLE conversation_action_drafts IS
  'Conversation-to-work intent only. DRAFT rows do not create task/case/incident/approval authority until the corresponding domain consumes them.';
