-- Runtime recovery boundary for WhatsApp support workers.
-- Triage PROCESSING work is replay-safe because downstream writes are idempotent.
-- Outbound SENDING work is not replay-safe: Meta may have accepted a message before
-- a worker died, so stale sends move to UNCERTAIN and require operator review.

ALTER TABLE support_channel_outbox
  DROP CONSTRAINT IF EXISTS support_channel_outbox_status_check;
ALTER TABLE support_channel_outbox
  ADD CONSTRAINT support_channel_outbox_status_check
  CHECK (status IN ('PENDING','SENDING','SENT','FAILED','UNCERTAIN'));

CREATE INDEX IF NOT EXISTS support_channel_outbox_uncertain_idx
  ON support_channel_outbox(created_at)
  WHERE status = 'UNCERTAIN';

COMMENT ON COLUMN support_channel_outbox.status IS
  'UNCERTAIN means a worker lost the result of a send after claiming it. It is never automatically replayed because doing so could duplicate a WhatsApp message.';
