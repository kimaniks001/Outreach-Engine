DO $$ BEGIN
  CREATE TYPE team_presence_status AS ENUM ('AVAILABLE','FOCUSED','AWAY','OFFLINE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE coverage_shift_status AS ENUM ('SCHEDULED','ACTIVE','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE work_routing_profiles
  ADD COLUMN IF NOT EXISTS working_days INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  ADD COLUMN IF NOT EXISTS local_start TIME NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS local_end TIME NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS presence_status team_presence_status NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS presence_note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS presence_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS team_coverage_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  queue_id UUID NOT NULL REFERENCES work_queues(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status coverage_shift_status NOT NULL DEFAULT 'SCHEDULED',
  responsibility TEXT NOT NULL DEFAULT '',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (char_length(responsibility) <= 500)
);
CREATE INDEX IF NOT EXISTS team_coverage_shifts_window_idx ON team_coverage_shifts(starts_at, ends_at, status);
CREATE INDEX IF NOT EXISTS team_coverage_shifts_user_idx ON team_coverage_shifts(user_id, starts_at);

CREATE TABLE IF NOT EXISTS work_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_user_id UUID NOT NULL REFERENCES users(id),
  summary TEXT NOT NULL,
  next_action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id),
  CHECK (char_length(btrim(summary)) BETWEEN 2 AND 4000),
  CHECK (char_length(btrim(next_action)) BETWEEN 2 AND 500)
);
CREATE INDEX IF NOT EXISTS work_handovers_item_idx ON work_handovers(work_item_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_work_handover_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'work handover history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS work_handovers_immutable ON work_handovers;
CREATE TRIGGER work_handovers_immutable BEFORE UPDATE ON work_handovers
FOR EACH ROW EXECUTE FUNCTION prevent_work_handover_mutation();

CREATE TABLE IF NOT EXISTS team_duty_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  queue_id UUID NOT NULL REFERENCES work_queues(id),
  primary_user_id UUID NOT NULL REFERENCES users(id),
  backup_user_id UUID REFERENCES users(id),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  cadence_days INTEGER NOT NULL DEFAULT 7 CHECK (cadence_days BETWEEN 1 AND 90),
  next_handoff_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CHECK (backup_user_id IS NULL OR backup_user_id <> primary_user_id)
);
CREATE INDEX IF NOT EXISTS team_duty_rotations_next_idx ON team_duty_rotations(next_handoff_at) WHERE active = TRUE;

COMMENT ON TABLE work_handovers IS 'Immutable remote-team continuity evidence. A handover transfers internal responsibility only and grants no SecurePay product or financial authority.';
COMMENT ON TABLE team_coverage_shifts IS 'Outreach staffing coverage, not employment/payroll or SecurePay transaction authority.';
