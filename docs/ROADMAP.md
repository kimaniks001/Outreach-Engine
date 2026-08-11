# Roadmap

Status: Phase 2 (Intelligence + Campaign + Creative) — IN PROGRESS
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

### PHASE 2 — Intelligence + Campaign + Creative (current)

Market intelligence, opportunity scoring, Brand Guardian, campaign strategy,
image-first creative, and the first live AI provider (Anthropic, optional —
a deterministic mock provider keeps the app usable without it). First phase
where [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md) and
[SECUREPAY_POSITIONING_RULES.md](SECUREPAY_POSITIONING_RULES.md) are
operationalized in code. See
[PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md](PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md)
and [PHASE_2_COMPLETION_REPORT.md](PHASE_2_COMPLETION_REPORT.md) for status.

### PHASE 3 — Targeting + Distribution

Audience targeting, paid media planning, Google/Meta integrations later,
prospect/business distribution. See
[AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](AUDIENCE_AND_CONVERSION_ARCHITECTURE.md)
Section 5.

### PHASE 4 — Audience Memory, Attribution & Conversion

Commercial memory, audience states, attribution, SecurePay product events,
unfinished journey recovery, next-best-action, retargeting, upsell. See
[AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](AUDIENCE_AND_CONVERSION_ARCHITECTURE.md)
Sections 2–4.

### PHASE 5 — Impact + Growth Director + Scale

Analytics, experiments, ROI, Growth Director, model self-check, selective
automation, optional read-only Analytics API. See
[ARCHITECTURE.md](ARCHITECTURE.md) Section 6.

## 3. Current Phase

**Phase 0 — Foundation** and **Phase 1 — Command Centre + AI Core** are
complete and merged to `main`. **Phase 2 — Intelligence + Campaign +
Creative** is in progress on branch
`begining-phase-2-intelligence-campaign-creative`. Phase 3 has not started.
See [PHASE_2_COMPLETION_REPORT.md](PHASE_2_COMPLETION_REPORT.md) for status
and final classification.

## 4. Explicitly Deferred Integrations

Not built or wired up until their phase, and not before: n8n, Clay, HubSpot,
Meta, Google Ads, TikTok Ads, LinkedIn Ads, OpenAI, Google Gemini, or other
social/paid-media integrations. Anthropic gained a live adapter in Phase 2
(optional — see [PHASE_2_AI_PROVIDER_INTEGRATION.md](PHASE_2_AI_PROVIDER_INTEGRATION.md));
OpenAI and Gemini remain non-live stubs.
