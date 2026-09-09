-- SecurePay-authoritative WhatsApp channel binding reflection.
-- Outreach never discovers a SecurePay identity from a phone number. It only
-- applies signed assertions from SecurePay about an already-verified contact
-- relationship, and it preserves those assertions for audit.

ALTER TABLE support_channel_identities
  ADD COLUMN IF NOT EXISTS binding_authority_sequence bigint NOT NULL DEFAULT 0 CHECK (binding_authority_sequence >= 0),
  ADD COLUMN IF NOT EXISTS binding_assertion_id text,
  ADD COLUMN IF NOT EXISTS binding_occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE TABLE IF NOT EXISTS support_channel_identity_assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assertion_id text NOT NULL UNIQUE CHECK (char_length(assertion_id) BETWEEN 8 AND 180),
  channel text NOT NULL CHECK (channel IN ('WHATSAPP')),
  channel_address text NOT NULL CHECK (char_length(channel_address) BETWEEN 5 AND 80),
  securepay_identity_ref text NOT NULL CHECK (char_length(securepay_identity_ref) BETWEEN 3 AND 120),
  action text NOT NULL CHECK (action IN ('BIND','REVOKE')),
  authority_sequence bigint NOT NULL CHECK (authority_sequence > 0),
  occurred_at timestamptz NOT NULL,
  applied boolean NOT NULL DEFAULT false,
  apply_reason text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_channel_identity_assertions_address_sequence_idx
  ON support_channel_identity_assertions(channel, channel_address, authority_sequence DESC);
CREATE INDEX IF NOT EXISTS support_channel_identity_assertions_identity_received_idx
  ON support_channel_identity_assertions(securepay_identity_ref, received_at DESC);

COMMENT ON TABLE support_channel_identity_assertions IS
  'Append-only SecurePay attestations about an independently verified communication relationship. These records do not create SecurePay identity authority.';
COMMENT ON COLUMN support_channel_identities.binding_authority_sequence IS
  'Latest SecurePay authority sequence applied to this communication address. Lower/equal assertions are historical only and cannot overwrite current state.';
