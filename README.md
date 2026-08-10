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
| 1 | Command Centre + AI Core | **In progress** |
| 2 | Intelligence + Campaign + Creative | Not started |
| 3 | Targeting + Distribution | Not started |
| 4 | Audience Memory, Attribution & Conversion | Not started |
| 5 | Impact + Growth Director + Scale | Not started |

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

## Current Phase: Phase 1 — Command Centre + AI Core

Phase 1 turns the Phase 0 doctrine into a real, running application: a
login-protected Command Centre with role-based navigation, server-enforced
RBAC, and the AI Gateway foundation (provider registry, model registry,
deterministic router) — with no live AI provider calls. See
[docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md](docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md)
for what was built, and
[docs/PHASE_1_COMPLETION_REPORT.md](docs/PHASE_1_COMPLETION_REPORT.md) for
status and final classification.

## Running Locally

```
cp .env.example .env.local        # fill in SESSION_SECRET (openssl rand -base64 32)
docker compose up -d db           # or: docker run ... postgres:16-alpine, see docker-compose.yml
npm install
npm run db:migrate
npm run db:seed                   # prints one-time random dev passwords for all 6 roles
npm run dev                       # http://localhost:3000
```

## What Is NOT Built Yet

- No AI provider is actually called — all three provider adapters are
  non-live stubs (no Anthropic/Claude, OpenAI, or Gemini API calls anywhere
  in this codebase). See
  [docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md](docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md)
  Section 7.
- No n8n, Clay, HubSpot, Meta, Google Ads, or other external/social
  integrations.
- No market intelligence, campaign strategy, creative generation, or Brand
  Guardian (Phase 2).
- No audience targeting, paid media, or commercial memory (Phase 3–4).
- No product-event attribution, Growth Director reasoning, or Analytics API
  (Phase 4–5).
- No credentials are committed; none are required to run Phase 1 locally.

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
| [docs/adr/](docs/adr/) | Architecture Decision Records |

## Build Mode

Phased. Practical. Minimal. Extensible. No over-engineering. Each phase
builds only what the next phase needs — see
[docs/ROADMAP.md](docs/ROADMAP.md).
