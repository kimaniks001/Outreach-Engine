-- Consumer-side binding epoch snapshots for WhatsApp support.
--
-- A communication address can be revoked and rebound. Pending inbound/outbound work
-- must therefore carry the exact SecurePay identity-binding epoch that authorised
-- its routing, rather than resolving the address again later.

ALTER TABLE support_channel_messages
  ADD COLUMN IF NOT EXISTS binding_securepay_identity_ref text,
  ADD COLUMN IF NOT EXISTS binding_authority_sequence bigint,
  ADD COLUMN IF NOT EXISTS binding_assertion_id text;

ALTER TABLE support_channel_messages
  ADD CONSTRAINT support_channel_messages_binding_snapshot_complete_check
  CHECK (
    (binding_securepay_identity_ref IS NULL AND binding_authority_sequence IS NULL AND binding_assertion_id IS NULL)
    OR
    (binding_securepay_identity_ref IS NOT NULL AND binding_authority_sequence IS NOT NULL AND binding_assertion_id IS NOT NULL AND binding_authority_sequence > 0)
  ) NOT VALID;

ALTER TABLE support_channel_messages
  DROP CONSTRAINT IF EXISTS support_channel_messages_processing_status_check;
ALTER TABLE support_channel_messages
  ADD CONSTRAINT support_channel_messages_processing_status_check
  CHECK (processing_status IN (
    'RECEIVED','WAITING_IDENTITY','ROUTED','TRIAGE_PENDING','TRIAGING','TRIAGED','ANSWERED','HUMAN_QUEUED','IGNORED','FAILED','STALE_BINDING'
  ));

ALTER TABLE support_channel_outbox
  ADD COLUMN IF NOT EXISTS expected_securepay_identity_ref text,
  ADD COLUMN IF NOT EXISTS expected_binding_authority_sequence bigint,
  ADD COLUMN IF NOT EXISTS expected_binding_assertion_id text;

ALTER TABLE support_channel_outbox
  ADD CONSTRAINT support_channel_outbox_binding_snapshot_complete_check
  CHECK (
    (expected_securepay_identity_ref IS NULL AND expected_binding_authority_sequence IS NULL AND expected_binding_assertion_id IS NULL)
    OR
    (expected_securepay_identity_ref IS NOT NULL AND expected_binding_authority_sequence IS NOT NULL AND expected_binding_assertion_id IS NOT NULL AND expected_binding_authority_sequence > 0)
  ) NOT VALID;

ALTER TABLE support_channel_outbox
  DROP CONSTRAINT IF EXISTS support_channel_outbox_status_check;
ALTER TABLE support_channel_outbox
  ADD CONSTRAINT support_channel_outbox_status_check
  CHECK (status IN ('PENDING','SENDING','SENT','FAILED','UNCERTAIN','CANCELLED'));

CREATE INDEX IF NOT EXISTS support_channel_messages_binding_epoch_idx
  ON support_channel_messages(channel, channel_address, binding_authority_sequence)
  WHERE binding_authority_sequence IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_channel_outbox_binding_epoch_idx
  ON support_channel_outbox(channel, channel_address, expected_binding_authority_sequence)
  WHERE expected_binding_authority_sequence IS NOT NULL;

COMMENT ON COLUMN support_channel_messages.binding_authority_sequence IS
  'Snapshot of the exact SecurePay communication-binding epoch that authorised this inbound message to enter triage. Null means no authoritative epoch was established.';
COMMENT ON COLUMN support_channel_outbox.expected_binding_authority_sequence IS
  'Exact SecurePay communication-binding epoch that must still be current before this outbound item may be sent. Null fails closed.';
COMMENT ON COLUMN support_channel_outbox.status IS
  'CANCELLED means delivery authority became stale before send. UNCERTAIN remains reserved for delivery-result uncertainty after a send was claimed.';