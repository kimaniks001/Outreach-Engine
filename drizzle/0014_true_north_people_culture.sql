DO $$ BEGIN CREATE TYPE organisation_experience AS ENUM ('STAFF','PLUG','MASTER','DIRECTOR','INVESTOR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE organisation_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO organisation_departments(department_key,name,purpose) VALUES
 ('TRADER_CARE','Trader Care','Help traders understand what is true and what they can do next.'),
 ('GROWTH','Growth','Turn grounded market learning into useful outreach.'),
 ('OPERATIONS','Operations','Keep service reliable, accountable and ready to respond.'),
 ('PRODUCT','Product','Improve the system from evidence, not noise.'),
 ('LEADERSHIP','Leadership','Hold direction, boundaries and organisational stewardship.')
ON CONFLICT(department_key) DO NOTHING;

CREATE TABLE people_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES organisation_departments(id) ON DELETE SET NULL,
  experience organisation_experience NOT NULL DEFAULT 'STAFF',
  introduction TEXT NOT NULL DEFAULT '',
  responsibilities TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  skills TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  help_with TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(char_length(introduction)<=600), CHECK(char_length(help_with)<=300),
  CHECK(cardinality(responsibilities)<=12), CHECK(cardinality(skills)<=20)
);
INSERT INTO people_profiles(user_id,experience)
SELECT id,CASE WHEN role IN ('OWNER','GROWTH_DIRECTOR') THEN 'DIRECTOR'::organisation_experience ELSE 'STAFF'::organisation_experience END FROM users
ON CONFLICT(user_id) DO NOTHING;

CREATE TABLE people_recognition (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipient_user_id UUID NOT NULL REFERENCES users(id),
 given_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL, contribution TEXT NOT NULL,
 work_item_id UUID REFERENCES work_items(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(char_length(btrim(contribution)) BETWEEN 8 AND 500), CHECK(recipient_user_id<>given_by_user_id)
);
CREATE INDEX people_recognition_recipient_idx ON people_recognition(recipient_user_id,created_at DESC);

CREATE TABLE organisation_milestones (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, meaning TEXT NOT NULL,
 happened_on DATE NOT NULL, created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(char_length(btrim(title)) BETWEEN 2 AND 140), CHECK(char_length(btrim(meaning)) BETWEEN 8 AND 1000)
);
CREATE TABLE organisation_rituals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, purpose TEXT NOT NULL, cadence TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 CHECK(char_length(btrim(name)) BETWEEN 2 AND 120), CHECK(char_length(btrim(purpose)) BETWEEN 8 AND 600), CHECK(char_length(btrim(cadence)) BETWEEN 2 AND 100)
);

CREATE OR REPLACE FUNCTION prevent_recognition_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'recognition is immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER people_recognition_immutable BEFORE UPDATE OR DELETE ON people_recognition FOR EACH ROW EXECUTE FUNCTION prevent_recognition_mutation();
COMMENT ON TABLE people_recognition IS 'Specific contribution acknowledgements; never a score, rank, entitlement, compensation or SecurePay authority.';
COMMENT ON COLUMN people_profiles.experience IS 'An Outreach experience context, not evidence of SecurePay role, status, entitlement or authority.';
