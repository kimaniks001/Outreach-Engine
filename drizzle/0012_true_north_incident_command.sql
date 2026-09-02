DO $$ BEGIN
  CREATE TYPE incident_severity AS ENUM ('SEV1','SEV2','SEV3','SEV4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE incident_state AS ENUM ('DETECTED','INVESTIGATING','MITIGATING','MONITORING','RESOLVED','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE incident_communication_state AS ENUM ('INTERNAL_ONLY','DRAFTED','AWAITING_APPROVAL','RELEASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS operations_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL UNIQUE REFERENCES work_items(id),
  conversation_id uuid NOT NULL UNIQUE REFERENCES staff_conversations(id),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 180),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 4000),
  severity incident_severity NOT NULL,
  state incident_state NOT NULL DEFAULT 'DETECTED',
  commander_user_id uuid NOT NULL REFERENCES users(id),
  affected_service text NOT NULL CHECK (char_length(btrim(affected_service)) BETWEEN 2 AND 120),
  affected_trader_count integer NOT NULL DEFAULT 0 CHECK (affected_trader_count >= 0),
  communication_state incident_communication_state NOT NULL DEFAULT 'INTERNAL_ONLY',
  communication_release_evidence_ref text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  root_cause_summary text,
  resolution_summary text,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operations_incidents_release_evidence_check CHECK (
    communication_state <> 'RELEASED' OR communication_release_evidence_ref IS NOT NULL
  ),
  CONSTRAINT operations_incidents_resolution_check CHECK (
    state NOT IN ('RESOLVED','CLOSED') OR (resolved_at IS NOT NULL AND resolution_summary IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS operations_incidents_state_severity_idx ON operations_incidents(state, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS operations_incidents_commander_idx ON operations_incidents(commander_user_id, state);

CREATE TABLE IF NOT EXISTS operations_incident_responders (
  incident_id uuid NOT NULL REFERENCES operations_incidents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, user_id)
);

CREATE TABLE IF NOT EXISTS operations_incident_case_links (
  incident_id uuid NOT NULL REFERENCES operations_incidents(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES trader_support_cases(id) ON DELETE CASCADE,
  linked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, case_id)
);

CREATE TABLE IF NOT EXISTS operations_incident_chronology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES operations_incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 4000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operations_incident_chronology_idx ON operations_incident_chronology(incident_id, created_at ASC);

CREATE TABLE IF NOT EXISTS operations_service_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_key text NOT NULL,
  service_key text NOT NULL,
  signal_kind text NOT NULL,
  severity_hint incident_severity,
  observed_count integer NOT NULL DEFAULT 1 CHECK (observed_count > 0),
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  evidence_ref text NOT NULL,
  proposed_incident_id uuid REFERENCES operations_incidents(id) ON DELETE SET NULL,
  UNIQUE(signal_key, evidence_ref)
);
CREATE INDEX IF NOT EXISTS operations_service_signals_service_time_idx ON operations_service_signals(service_key, last_observed_at DESC);

COMMENT ON TABLE operations_incidents IS
  'Outreach internal incident coordination. Incident state never changes SecurePay payment, agreement, identity, release, settlement, ledger or provider authority.';
COMMENT ON COLUMN operations_incidents.communication_release_evidence_ref IS
  'Evidence that an authorised external communication workflow released a message. Recording evidence here does not publish anything.';
COMMENT ON TABLE operations_service_signals IS
  'Operational evidence and clustering inputs only. A signal may propose an incident but may not silently create external, financial or SecurePay product truth.';