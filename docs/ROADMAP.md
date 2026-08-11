# Roadmap

Status: Phase 4 (Audience Memory, Attribution & Conversion) — IN PROGRESS
Last updated: 2026-08-11

## 1. Principle

The Outreach Engine build is intentionally scoped to exactly **six phases**.
This roadmap is not to be expanded into a long tail of micro-phases. New work
gets absorbed into the phase it belongs to, or deferred to a later phase —
it does not create a new phase.

## 2. The Six Phases

### PHASE 0 — Foundation (complete)

Doctrine, governance, RBAC, AI rules, data classification, provenance,
cost/safety controls, architecture. Documentation and architecture only —
no application code, no integrations, no credentials. See
[PHASE_0_COMPLETION_REPORT.md](PHASE_0_COMPLETION_REPORT.md).

### PHASE 1 — Command Centre + AI Core (complete)

Authentication, roles, dashboard, AI Gateway, provider registry/router,
usage tracking. First phase with real application code and the AI Gateway
/ provider-adapter *architecture*, gated by
[AI_GOVERNANCE.md](AI_GOVERNANCE.md) and
[MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md) — no live provider calls
yet; see
[PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md](PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md)
Section 2 for that distinction. See
[PHASE_1_COMPLETION_REPORT.md](PHASE_1_COMPLETION_REPORT.md) for status.

### PHASE 2 — Intelligence + Campaign + Creative (complete)

Market intelligence, opportunity scoring, Brand Guardian, campaign strategy,
image-first creative, and the first live AI provider (Anthropic, optional —
a deterministic mock provider keeps the app usable without it). First phase
where [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md) and
[SECUREPAY_POSITIONING_RULES.md](SECUREPAY_POSITIONING_RULES.md) are
operationalized in code. See
[PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md](PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md)
and [PHASE_2_COMPLETION_REPORT.md](PHASE_2_COMPLETION_REPORT.md) for status.

### PHASE 3 — Targeting + Distribution (complete)

Audience targeting with transparent scoring, a deterministic Channel
Recommendation engine, budget-guarded distribution plans, and controlled
(simulated-only) execution through a provider-agnostic adapter interface —
Google/Meta remain boundary-only stubs pending real credentials in a
future phase. See
[AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](AUDIENCE_AND_CONVERSION_ARCHITECTURE.md)
Section 5,
[PHASE_3_TARGETING_AND_DISTRIBUTION.md](PHASE_3_TARGETING_AND_DISTRIBUTION.md),
and [PHASE_3_COMPLETION_REPORT.md](PHASE_3_COMPLETION_REPORT.md) for status.

### PHASE 4 — Audience Memory, Attribution & Conversion (current)

Commercial memory (Unified Audience Profiles + organizations), deterministic
identity resolution, the locked audience lifecycle-state engine, centralized
consent/suppression, a secure idempotent SecurePay product-event ingestion
boundary + deterministic simulator, threshold-based abandoned-journey
detection, a deterministic explainable Next-Best-Action engine,
frequency-guarded retargeting eligibility, and a four-model multi-touch
attribution + conversion-funnel engine feeding a real (non-fabricated)
Impact dashboard. No autonomous outreach, no Growth Director reasoning. See
[AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](AUDIENCE_AND_CONVERSION_ARCHITECTURE.md)
Sections 2–4,
[PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md](PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md),
and [PHASE_4_COMPLETION_REPORT.md](PHASE_4_COMPLETION_REPORT.md) for status.

### PHASE 5 — Impact + Growth Director + Scale

Analytics, experiments, ROI, Growth Director, model self-check, selective
automation, optional read-only Analytics API. See
[ARCHITECTURE.md](ARCHITECTURE.md) Section 6.

## 3. Current Phase

**Phase 0 — Foundation**, **Phase 1 — Command Centre + AI Core**,
**Phase 2 — Intelligence + Campaign + Creative**, and **Phase 3 —
Targeting + Distribution** are complete and merged to `main`. **Phase 4 —
Audience Memory, Attribution & Conversion** is in progress on branch
`begining-phase-4-audience-memory-attribution-conversion`. Phase 5 has not
started. See [PHASE_4_COMPLETION_REPORT.md](PHASE_4_COMPLETION_REPORT.md)
for status and final classification.

## 4. Explicitly Deferred Integrations

Not built or wired up until their phase, and not before: n8n, Clay, HubSpot,
TikTok Ads, LinkedIn Ads, OpenAI, Google Gemini, or other social integrations.
Anthropic gained a live adapter in Phase 2 (optional — see
[PHASE_2_AI_PROVIDER_INTEGRATION.md](PHASE_2_AI_PROVIDER_INTEGRATION.md));
OpenAI and Gemini remain non-live stubs. Google Ads and Meta Ads gained
boundary-only adapter *stubs* in Phase 3 (no credentials, never
`AVAILABLE` — see
[PHASE_3_PROVIDER_ADAPTERS.md](PHASE_3_PROVIDER_ADAPTERS.md)); live
credentials for either remain deferred to a future phase.
