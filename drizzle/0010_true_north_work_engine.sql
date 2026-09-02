DO $$ BEGIN
  CREATE TYPE work_item_type AS ENUM ('TASK', 'CASE', 'INCIDENT', 'FOLLOW_UP', 'APPROVAL', 'KNOWLEDGE', 'SCHEDULE', 'PROJECT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE work_item_status AS ENUM ('INBOX', 'READY', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE work_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS work_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_role role,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO work_queues (queue_key, name, description, default_role)
VALUES
  ('GENERAL', 'General', 'Shared internal work that has not yet moved to a specialist queue.', NULL),
  ('TRADER_SUPPORT', 'Trader support', 'Work connected to helping SecurePay traders.', NULL),
  ('OPERATIONS', 'Operations', 'Operational continuity, service and incident-related work.', 'OWNER'),
  ('GROWTH', 'Growth', 'Campaign, market, content and commercial coordination work.', 'STRATEGIST'),
  ('APPROVALS', 'Approvals', 'Items requiring governed human review or approval.', 'OWNER')
ON CONFLICT (queue_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS work_routing_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  languages TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[],
  available BOOLEAN NOT NULL DEFAULT TRUE,
  max_active_work INTEGER NOT NULL DEFAULT 20 CHECK (max_active_work BETWEEN 1 AND 200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO work_routing_profiles (user_id)
SELECT id FROM users WHERE active = TRUE
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type work_item_type NOT NULL,
  title TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  queue_id UUID NOT NULL REFERENCES work_queues(id),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  priority work_priority NOT NULL DEFAULT 'NORMAL',
  status work_item_status NOT NULL DEFAULT 'INBOX',
  due_at TIMESTAMPTZ,
  sla_due_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  recurrence_rule TEXT,
  required_role role,
  required_language TEXT,
  preferred_timezone TEXT,
  routing_reason TEXT,
  source_conversation_id UUID REFERENCES staff_conversations(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES staff_messages(id) ON DELETE SET NULL,
  source_action_draft_id UUID UNIQUE REFERENCES conversation_action_drafts(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_items_title_check CHECK (char_length(btrim(title)) BETWEEN 2 AND 180),
  CONSTRAINT work_items_recurrence_check CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  CONSTRAINT work_items_terminal_time_check CHECK (
    (status <> 'DONE' OR completed_at IS NOT NULL)
    AND (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS work_items_owner_status_idx ON work_items(owner_user_id, status, priority);
CREATE INDEX IF NOT EXISTS work_items_queue_status_idx ON work_items(queue_id, status, priority);
CREATE INDEX IF NOT EXISTS work_items_due_idx ON work_items(due_at) WHERE status NOT IN ('DONE', 'CANCELLED');
CREATE INDEX IF NOT EXISTS work_items_sla_idx ON work_items(sla_due_at) WHERE status NOT IN ('DONE', 'CANCELLED');
CREATE INDEX IF NOT EXISTS work_items_schedule_idx ON work_items(scheduled_for) WHERE status NOT IN ('DONE', 'CANCELLED');

CREATE TABLE IF NOT EXISTS work_collaborators (
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (work_item_id, user_id)
);

CREATE TABLE IF NOT EXISTS work_dependencies (
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  depends_on_work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (work_item_id, depends_on_work_item_id),
  CONSTRAINT work_dependency_not_self CHECK (work_item_id <> depends_on_work_item_id)
);

CREATE TABLE IF NOT EXISTS work_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_history_item_time_idx ON work_history(work_item_id, created_at DESC);

ALTER TABLE conversation_action_drafts
  DROP CONSTRAINT IF EXISTS conversation_action_drafts_status_check;
ALTER TABLE conversation_action_drafts
  ADD COLUMN IF NOT EXISTS converted_work_item_id UUID REFERENCES work_items(id) ON DELETE SET NULL;
ALTER TABLE conversation_action_drafts
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE conversation_action_drafts
  ADD CONSTRAINT conversation_action_drafts_status_check CHECK (status IN ('DRAFT', 'CONVERTED'));

COMMENT ON TABLE work_items IS
  'Outreach internal responsibility objects. They coordinate human work but confer no SecurePay identity, agreement, payment, release, settlement or financial authority.';
COMMENT ON COLUMN work_items.routing_reason IS
  'Explainable routing evidence only. Routing assigns internal responsibility; it does not grant product or financial authority.';
COMMENT ON TABLE work_routing_profiles IS
  'Phase 3 routing inputs. Phase 6 may enrich presence/working-hours semantics without changing work ownership history.';
COMMENT ON TABLE work_history IS
  'Append-only human-operational history for responsibility changes and lifecycle events.';
