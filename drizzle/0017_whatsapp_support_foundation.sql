CREATE TABLE IF NOT EXISTS support_channel_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('WHATSAPP')),
  channel_address text NOT NULL CHECK (char_length(channel_address) BETWEEN 5 AND 80),
  securepay_identity_ref text,
  verified_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, channel_address)
);

CREATE INDEX IF NOT EXISTS support_channel_identities_securepay_ref_idx
  ON support_channel_identities(securepay_identity_ref)
  WHERE securepay_identity_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('WHATSAPP')),
  channel_message_id text NOT NULL,
  channel_address text NOT NULL CHECK (char_length(channel_address) BETWEEN 5 AND 80),
  message_type text NOT NULL CHECK (char_length(message_type) BETWEEN 2 AND 40),
  body text CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 6000),
  reply_to_channel_message_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'RECEIVED'
    CHECK (processing_status IN ('RECEIVED','WAITING_IDENTITY','ROUTED','IGNORED','FAILED')),
  support_conversation_id uuid REFERENCES trader_support_conversations(id) ON DELETE SET NULL,
  trader_support_message_id uuid REFERENCES trader_support_messages(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (channel, channel_message_id)
);

CREATE INDEX IF NOT EXISTS support_channel_messages_address_received_idx
  ON support_channel_messages(channel, channel_address, received_at DESC);
CREATE INDEX IF NOT EXISTS support_channel_messages_pending_idx
  ON support_channel_messages(processing_status, received_at)
  WHERE processing_status IN ('RECEIVED','WAITING_IDENTITY');

COMMENT ON TABLE support_channel_identities IS
  'Purpose-limited mapping from a communication address to a verified SecurePay identity. A WhatsApp phone number alone never establishes SecurePay identity.';
COMMENT ON TABLE support_channel_messages IS
  'Idempotent external support-channel intake. Transaction/agreement authority never originates here.';
