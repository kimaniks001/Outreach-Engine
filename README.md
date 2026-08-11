# SecurePay Outreach Engine

SecurePay Outreach Engine is an AI-assisted commercial operating system for
SecurePay. It continuously drives one cycle — **LISTEN → UNDERSTAND → DECIDE
→ CREATE → DISTRIBUTE → CONVERT → MEASURE → LEARN → ACT AGAIN** — to keep
answering a single question:

> **"What should SecurePay do next, and why?"**

Core positioning it exists to protect:

> **"Money should follow the agreement."**
> **"SecurePay is the agreement layer for money."**

SecurePay must never be positioned as a wallet, a bank, an M-PESA
competitor, another payment app, or an escrow product. See
[docs/SECUREPAY_POSITIONING_RULES.md](docs/SECUREPAY_POSITIONING_RULES.md).

## The Five Pillars

There are exactly five commercial pillars (fixed — see
[ADR-008](docs/adr/ADR-008-five-pillars-fixed-growth-director-supervisory.md)):

1. **MARKETING** — find and communicate real problems SecurePay can solve.
2. **POSITIONING** — protect how SecurePay is understood.
3. **DISTRIBUTION** — decide who hears the message and through which
   channels.
4. **IMPACT** — measure what actually happened.
5. **ACTION** — decide the next best commercial action based on evidence.

**Growth Director** supervises across all five pillars — it is not a sixth
pillar.

Full doctrine: [docs/OUTREACH_ENGINE_DOCTRINE.md](docs/OUTREACH_ENGINE_DOCTRINE.md)

## The Six-Phase Roadmap

| Phase | Name | Status |
|---|---|---|
| 0 | Foundation | Complete |
| 1 | Command Centre + AI Core | Complete |
| 2 | Intelligence + Campaign + Creative | Complete |
| 3 | Targeting + Distribution | Complete |
| 4 | Audience Memory, Attribution & Conversion | Complete |
| 5 | Impact + Growth Director + Scale | **Complete — final planned phase** |

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

## Current Phase: Phase 5 — Impact + Growth Director + Scale (final)

Phase 5 closes the commercial learning loop — MEASURE → LEARN → RECOMMEND
→ PRIORITIZE → ACT WITH APPROVAL → MEASURE AGAIN — and is the **final
planned phase** of the six-phase roadmap. Impact scorecards (campaign/
channel/product/audience) and a never-fabricated ROI/efficiency model;
real A/B experiments evaluated against actual SecurePay behavior (not
clicks) with a deterministic winner/inconclusive engine; durable
Commercial Learning records; a hybrid deterministic + AI Growth Director
that generates ranked, evidence-backed recommendations and answers "What
should SecurePay do next?" with 3-7 real, traceable items; risk-tiered
human approval (HIGH-risk actions are Owner-only, budget changes are
never automated even when approved); a model-performance/model-
recommendation engine with a small SecurePay-specific benchmark suite;
full AI cost governance with a circuit-breaker hard-budget guard inside
the AI Gateway; a minimal, audited retention-review/anonymization
closure; and a narrow, internal, read-only Analytics API. See
[docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md](docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md)
for what was built,
[docs/PHASE_5_EXPERIMENTS_AND_LEARNING.md](docs/PHASE_5_EXPERIMENTS_AND_LEARNING.md)
for experiments/learning,
[docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md](docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md)
for model self-check/cost control,
[docs/PHASE_5_ANALYTICS_API.md](docs/PHASE_5_ANALYTICS_API.md) for the
Analytics API boundary, and
[docs/PHASE_5_COMPLETION_REPORT.md](docs/PHASE_5_COMPLETION_REPORT.md) for
status and final classification.

**No Phase 6 exists or is planned.** Future work beyond this roadmap is
tracked as post-roadmap enhancements (see
[docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md](docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md)
Section 12), not new phases.

Phase 4 (previous): commercial memory, identity resolution, lifecycle
state, product-event ingestion, journeys, next-best-action, and
attribution. See
[docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md](docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md)
and [docs/PHASE_4_COMPLETION_REPORT.md](docs/PHASE_4_COMPLETION_REPORT.md).

## Running Locally

```
cp .env.example .env.local        # fill in SESSION_SECRET (openssl rand -base64 32)
                                   # ANTHROPIC_API_KEY is optional — see docs/PHASE_2_AI_PROVIDER_INTEGRATION.md
docker compose up -d db           # or: docker run ... postgres:16-alpine, see docker-compose.yml
npm install
npm run db:migrate
npm run db:seed                   # prints one-time random dev passwords for all 6 roles,
                                   # seeds one clearly-labeled DEMO market signal; once
                                   # that demo campaign is walked to READY_FOR_DISTRIBUTION
                                   # (via the UI/API — one-time manual step, same precedent
                                   # since Phase 2), re-running db:seed cascades an approved
                                   # demo audience, a running SIMULATED distribution plan,
                                   # a full Phase 4 construction demo journey, and a Phase 5
                                   # A/B experiment + Growth Director recommendations
npm run dev                       # http://localhost:3000
```

## What Is NOT Built Yet

- Only Anthropic has a live adapter, and it's optional — OpenAI/Gemini
  remain non-live Phase 1 stubs, and the app is fully usable via a
  deterministic mock AI provider with zero credentials. See
  [docs/PHASE_2_AI_PROVIDER_INTEGRATION.md](docs/PHASE_2_AI_PROVIDER_INTEGRATION.md).
- No autonomous web crawling, social scraping, or continuous background
  monitoring.
- No n8n, Clay, or HubSpot integration.
- No live Google/Meta/TikTok/LinkedIn Ads execution or real paid-media
  spend — Phase 3 ships exactly one working distribution adapter, a
  deterministic **simulated** one, plus boundary-only Google/Meta stubs
  that never falsely report `AVAILABLE`. See
  [docs/PHASE_3_PROVIDER_ADAPTERS.md](docs/PHASE_3_PROVIDER_ADAPTERS.md).
- No production email/WhatsApp/partner-platform sending — those channels
  are plannable and simulate-launchable, not live-sendable, in Phase 3-4.
- No autonomous outreach: next-best-action and retargeting eligibility are
  decisions, never automatic sends or automatic distribution-plan launches.
- No autonomous ad spending, budget changes, or bulk outreach — Growth
  Director's action bridge hard-refuses to automate `INCREASE_BUDGET_REQUEST`/
  `REDUCE_BUDGET_REQUEST`, always returning `BLOCKED`.
  See [docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md](docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md).
- No automatic/hourly AI model-routing switching — a model recommendation
  only ever changes routing after explicit Owner approval **and** a
  separate explicit "apply" action.
- No external-client Analytics API auth (API keys/OAuth) — the Analytics
  API is internal, session-authenticated, read-only only. See
  [docs/PHASE_5_ANALYTICS_API.md](docs/PHASE_5_ANALYTICS_API.md).
- No scheduler/cron/queue infrastructure — every refresh/sweep function is
  on-demand and manually triggerable; the interface is documented for a
  future automation layer, not built as one.
- No CRM replacement, HubSpot/Clay/n8n integration, or data warehouse.
- No credentials are committed; none are required to run Phase 1-5
  locally — see
  [docs/PHASE_4_PRODUCT_EVENT_INTEGRATION.md](docs/PHASE_4_PRODUCT_EVENT_INTEGRATION.md)
  for the optional (unset-by-default) product-event ingestion secret.
- No Phase 6 — this is the final planned phase. Future work is tracked as
  post-roadmap enhancements, not new phases.

## Documentation Map

| Document | Purpose |
|---|---|
| [docs/OUTREACH_ENGINE_DOCTRINE.md](docs/OUTREACH_ENGINE_DOCTRINE.md) | Purpose, five pillars, principles |
| [docs/SECUREPAY_POSITIONING_RULES.md](docs/SECUREPAY_POSITIONING_RULES.md) | How SecurePay must and must not be described |
| [docs/AI_GOVERNANCE.md](docs/AI_GOVERNANCE.md) | What AI can/cannot do, risk tiers |
| [docs/ACCESS_CONTROL_MODEL.md](docs/ACCESS_CONTROL_MODEL.md) | RBAC roles and permissions |
| [docs/DATA_CLASSIFICATION.md](docs/DATA_CLASSIFICATION.md) | PUBLIC / INTERNAL / CONFIDENTIAL / RESTRICTED |
| [docs/MODEL_CONTROL_PLANE.md](docs/MODEL_CONTROL_PLANE.md) | Provider/model abstraction and metadata |
| [docs/SOURCE_PROVENANCE.md](docs/SOURCE_PROVENANCE.md) | Intelligence source tracking model |
| [docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md) | Future commercial memory, journey recovery, paid media, creative |
| [docs/AUDIT_AND_CONTROL.md](docs/AUDIT_AND_CONTROL.md) | Audit events, Safe Mode / kill switch |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and technology recommendation |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Six-phase build roadmap |
| [docs/PHASE_0_COMPLETION_REPORT.md](docs/PHASE_0_COMPLETION_REPORT.md) | Phase 0 delivery record |
| [docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md](docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md) | Phase 1 architecture, stack, and design decisions |
| [docs/PHASE_1_TEST_AND_VALIDATION_REPORT.md](docs/PHASE_1_TEST_AND_VALIDATION_REPORT.md) | Phase 1 lint/typecheck/test/build/security results |
| [docs/PHASE_1_COMPLETION_REPORT.md](docs/PHASE_1_COMPLETION_REPORT.md) | Phase 1 delivery record |
| [docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md](docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md) | Phase 2 architecture and design decisions |
| [docs/PHASE_2_AI_PROVIDER_INTEGRATION.md](docs/PHASE_2_AI_PROVIDER_INTEGRATION.md) | Live Anthropic + mock AI provider integration |
| [docs/PHASE_2_TEST_AND_VALIDATION_REPORT.md](docs/PHASE_2_TEST_AND_VALIDATION_REPORT.md) | Phase 2 lint/typecheck/test/build/security results |
| [docs/PHASE_2_COMPLETION_REPORT.md](docs/PHASE_2_COMPLETION_REPORT.md) | Phase 2 delivery record |
| [docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md](docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md) | Phase 3 architecture and design decisions |
| [docs/PHASE_3_PROVIDER_ADAPTERS.md](docs/PHASE_3_PROVIDER_ADAPTERS.md) | Distribution adapter architecture, simulated adapter, Google/Meta readiness |
| [docs/PHASE_3_TEST_AND_VALIDATION_REPORT.md](docs/PHASE_3_TEST_AND_VALIDATION_REPORT.md) | Phase 3 lint/typecheck/test/build/security results |
| [docs/PHASE_3_COMPLETION_REPORT.md](docs/PHASE_3_COMPLETION_REPORT.md) | Phase 3 delivery record |
| [docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md](docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md) | Phase 4 architecture and design decisions |
| [docs/PHASE_4_PRODUCT_EVENT_INTEGRATION.md](docs/PHASE_4_PRODUCT_EVENT_INTEGRATION.md) | SecurePay product-event ingestion boundary, idempotency, simulator |
| [docs/PHASE_4_PRIVACY_CONSENT_RETENTION.md](docs/PHASE_4_PRIVACY_CONSENT_RETENTION.md) | Data minimization, consent/suppression, retention model |
| [docs/PHASE_4_TEST_AND_VALIDATION_REPORT.md](docs/PHASE_4_TEST_AND_VALIDATION_REPORT.md) | Phase 4 lint/typecheck/test/build/security results |
| [docs/PHASE_4_COMPLETION_REPORT.md](docs/PHASE_4_COMPLETION_REPORT.md) | Phase 4 delivery record |
| [docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md](docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md) | Phase 5 architecture and design decisions |
| [docs/PHASE_5_EXPERIMENTS_AND_LEARNING.md](docs/PHASE_5_EXPERIMENTS_AND_LEARNING.md) | Experiment domain, evaluation engine, Commercial Learning |
| [docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md](docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md) | Model self-check, benchmark suite, AI cost governance |
| [docs/PHASE_5_ANALYTICS_API.md](docs/PHASE_5_ANALYTICS_API.md) | Internal read-only Analytics API boundary |
| [docs/PHASE_5_TEST_AND_VALIDATION_REPORT.md](docs/PHASE_5_TEST_AND_VALIDATION_REPORT.md) | Phase 5 lint/typecheck/test/build/security results |
| [docs/PHASE_5_COMPLETION_REPORT.md](docs/PHASE_5_COMPLETION_REPORT.md) | Phase 5 delivery record — final phase |
| [docs/adr/](docs/adr/) | Architecture Decision Records |

## Build Mode

Phased. Practical. Minimal. Extensible. No over-engineering. Each phase
builds only what the next phase needs — see
[docs/ROADMAP.md](docs/ROADMAP.md).
