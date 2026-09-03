CREATE TABLE growth_nervous_system_links (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), friction_event_id UUID NOT NULL UNIQUE REFERENCES trader_friction_events(id) ON DELETE RESTRICT,
 market_signal_id UUID NOT NULL UNIQUE REFERENCES market_signals(id) ON DELETE RESTRICT,
 work_item_id UUID NOT NULL UNIQUE REFERENCES work_items(id) ON DELETE RESTRICT,
 conversation_id UUID NOT NULL REFERENCES staff_conversations(id) ON DELETE RESTRICT,
 created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX growth_nervous_system_links_time_idx ON growth_nervous_system_links(created_at DESC);
COMMENT ON TABLE growth_nervous_system_links IS 'Traceable friction-to-learning coordination. A link is not an opportunity approval, relationship, referral attribution, entitlement, campaign approval or product decision.';
