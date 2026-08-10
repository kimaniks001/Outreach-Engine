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
| 2 | Intelligence + Campaign + Creative | **In progress** |
| 3 | Targeting + Distribution | Not started |
| 4 | Audience Memory, Attribution & Conversion | Not started |
| 5 | Impact + Growth Director + Scale | Not started |

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

## Current Phase: Phase 2 — Intelligence + Campaign + Creative

Phase 2 makes the Outreach Engine useful for the first time: a real Market
Intelligence workspace (signals, source provenance, AI-assisted opportunity
analysis with transparent scoring), a deterministic Brand Guardian, a
human-approval-gated Campaign lifecycle, and an image-first Content &
Creative Studio — proving INTELLIGENCE → OPPORTUNITY → BRAND REVIEW →
CAMPAIGN → CREATIVE → HUMAN APPROVAL end to end. It also introduces the
first live AI provider (Anthropic, optional) alongside a deterministic mock
provider so the app never requires credentials to be usable. See
[docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md](docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md)
for what was built, and
[docs/PHASE_2_COMPLETION_REPORT.md](docs/PHASE_2_COMPLETION_REPORT.md) for
status and final classification.

## Running Locally

```
cp .env.example .env.local        # fill in SESSION_SECRET (openssl rand -base64 32)
                                   # ANTHROPIC_API_KEY is optional — see docs/PHASE_2_AI_PROVIDER_INTEGRATION.md
docker compose up -d db           # or: docker run ... postgres:16-alpine, see docker-compose.yml
npm install
npm run db:migrate
npm run db:seed                   # prints one-time random dev passwords for all 6 roles,
                                   # seeds one clearly-labeled DEMO market signal
npm run dev                       # http://localhost:3000
```

## What Is NOT Built Yet

- Only Anthropic has a live adapter, and it's optional — OpenAI/Gemini
  remain non-live Phase 1 stubs, and the app is fully usable via a
  deterministic mock AI provider with zero credentials. See
  [docs/PHASE_2_AI_PROVIDER_INTEGRATION.md](docs/PHASE_2_AI_PROVIDER_INTEGRATION.md).
- No autonomous web crawling, social scraping, or continuous background
  monitoring.
- No n8n, Clay, HubSpot, Meta/Google/TikTok/LinkedIn Ads execution, paid
  media spend, or social/email/WhatsApp outreach — no distribution/publish
  action of any kind exists; approved campaigns stop at
  `READY_FOR_DISTRIBUTION`.
- No audience targeting, commercial memory, retargeting, or journey
  recovery (Phase 3–4).
- No product-event attribution, Growth Director reasoning, or Analytics API
  (Phase 4–5).
- No credentials are committed; none are required to run Phase 1 or 2
  locally.

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
| [docs/adr/](docs/adr/) | Architecture Decision Records |

## Build Mode

Phased. Practical. Minimal. Extensible. No over-engineering. Each phase
builds only what the next phase needs — see
[docs/ROADMAP.md](docs/ROADMAP.md).
