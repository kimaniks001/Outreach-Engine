CREATE TABLE outreach_copilot_briefs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 query TEXT NOT NULL, summary TEXT NOT NULL, priorities JSONB NOT NULL DEFAULT '[]', patterns JSONB NOT NULL DEFAULT '[]', suggested_actions JSONB NOT NULL DEFAULT '[]',
 grounding_refs JSONB NOT NULL DEFAULT '[]', ai_usage_record_id UUID REFERENCES ai_usage_records(id) ON DELETE SET NULL,
 provider_is_mock BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(char_length(btrim(query)) BETWEEN 2 AND 500), CHECK(char_length(summary) BETWEEN 2 AND 4000)
);
CREATE INDEX outreach_copilot_briefs_user_time_idx ON outreach_copilot_briefs(requested_by_user_id,created_at DESC);
COMMENT ON TABLE outreach_copilot_briefs IS 'Evidence-grounded organisational assistance. Suggestions are drafts and confer no execution, approval, SecurePay product or financial authority.';
