DO $$ BEGIN
  CREATE TYPE support_triage_route AS ENUM ('AUTO_GUIDANCE','AUTO_CONTEXT','PLUG','SECUREPAY_STAFF','SENSITIVE_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_triage_intent AS ENUM (
    'GENERAL','ACCESS_OTP','AGREEMENT','PAYMENT','DELIVERY_MILESTONE','DISPUTE','FEEDBACK','HUMAN_REQUEST','SENSITIVE','UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE support_channel_messages
  DROP CONSTRAINT IF EXISTS support_channel_messages_processing_status_check;
ALTER TABLE support_channel_messages
  ADD CONSTRAINT support_channel_messages_processing_status_check
  CHECK (processing_status IN (
    'RECEIVED','WAITING_IDENTITY','ROUTED','TRIAGE_PENDING','TRIAGING','TRIAGED','ANSWERED','HUMAN_QUEUED','IGNORED','FAILED'
  ));

CREATE TABLE IF NOT EXISTS support_triage_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_message_id uuid NOT NULL UNIQUE REFERENCES support_channel_messages(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DONE','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_triage_jobs_ready_idx
  ON support_triage_jobs(status, available_at, created_at)
  WHERE status IN ('PENDING','FAILED');

CREATE TABLE IF NOT EXISTS support_triage_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_message_id uuid NOT NULL UNIQUE REFERENCES support_channel_messages(id) ON DELETE CASCADE,
  support_conversation_id uuid REFERENCES trader_support_conversations(id) ON DELETE SET NULL,
  support_case_id uuid REFERENCES trader_support_cases(id) ON DELETE SET NULL,
  intent support_triage_intent NOT NULL,
  route support_triage_route NOT NULL,
  priority work_priority NOT NULL DEFAULT 'NORMAL',
  requires_securepay_context boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  aggregate_message_count integer NOT NULL DEFAULT 1 CHECK (aggregate_message_count BETWEEN 1 AND 50),
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_triage_decisions_route_idx ON support_triage_decisions(route, decided_at DESC);

CREATE TABLE IF NOT EXISTS support_channel_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('WHATSAPP')),
  channel_address text NOT NULL CHECK (char_length(channel_address) BETWEEN 5 AND 80),
  source_channel_message_id uuid REFERENCES support_channel_messages(id) ON DELETE SET NULL,
  support_conversation_id uuid REFERENCES trader_support_conversations(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4096),
  reply_to_channel_message_id text,
  purpose text NOT NULL CHECK (purpose IN ('AUTO_GUIDANCE','AUTO_CONTEXT','ACKNOWLEDGEMENT','HUMAN_REPLY')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  provider_message_id text,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_channel_message_id, purpose)
);
CREATE INDEX IF NOT EXISTS support_channel_outbox_ready_idx
  ON support_channel_outbox(status, available_at, created_at)
  WHERE status IN ('PENDING','FAILED');

INSERT INTO work_queues (queue_key, name, description, default_role)
VALUES
  ('PLUG_SUPPORT', 'Plug support', 'Bounded customer-success jobs suitable for authorised Plugs/freelancers.', NULL),
  ('SECUREPAY_STAFF', 'SecurePay staff', 'Support matters requiring SecurePay staff authority or specialist handling.', 'OWNER'),
  ('SENSITIVE_REVIEW', 'Sensitive review', 'Bereavement, compliance, fraud, legal or other sensitive matters. Never routed to ordinary Plugs.', 'OWNER')
ON CONFLICT (queue_key) DO NOTHING;

COMMENT ON TABLE support_triage_jobs IS
  'Durable queue for WhatsApp support classification. Webhooks persist quickly; workers claim jobs with SKIP LOCKED for horizontal scale.';
COMMENT ON TABLE support_triage_decisions IS
  'Explainable support-routing outcome. It assigns support handling only and grants no SecurePay agreement, identity, money, release or settlement authority.';
COMMENT ON TABLE support_channel_outbox IS
  'Durable outbound support messages. A support decision is persisted before transport so provider retries/outages do not lose customer communication.';
