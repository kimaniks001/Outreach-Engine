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
| 0 | Foundation | **In progress** |
| 1 | Command Centre + AI Core | Not started |
| 2 | Intelligence + Campaign + Creative | Not started |
| 3 | Targeting + Distribution | Not started |
| 4 | Audience Memory, Attribution & Conversion | Not started |
| 5 | Impact + Growth Director + Scale | Not started |

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

## Current Phase: Phase 0 — Foundation

Phase 0 is documentation and architecture only. It establishes the rules
Phase 1 onward must build against: governance, access control, data
classification, AI provider/model architecture, source provenance, audit and
safety controls. See
[docs/PHASE_0_COMPLETION_REPORT.md](docs/PHASE_0_COMPLETION_REPORT.md) for
status and final classification.

## What Is NOT Built Yet

Nothing beyond documentation exists yet. Specifically, as of Phase 0:

- No application code, database, or deployed infrastructure.
- No authentication, dashboard, or RBAC enforcement code.
- No AI provider integrations (no Anthropic/Claude, OpenAI, Gemini, or any
  other LLM wired up).
- No n8n, Clay, HubSpot, Meta, Google Ads, or other external/social
  integrations.
- No credentials, API keys, or secrets are configured or required.
- No commercial memory, audience-state engine, journey-recovery engine,
  paid-media integration, or creative-generation pipeline.
- No Analytics API.

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
| [docs/adr/](docs/adr/) | Architecture Decision Records |

## Build Mode

Phased. Practical. Minimal. Extensible. No over-engineering. Each phase
builds only what the next phase needs — see
[docs/ROADMAP.md](docs/ROADMAP.md).
