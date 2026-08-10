# Outreach Engine Doctrine

Status: Phase 0 (Foundation)
Owner: SecurePay
Last updated: 2026-08-10

## 1. What Outreach Engine Is

SecurePay Outreach Engine is an AI-assisted commercial operating system for
SecurePay. It exists to continuously drive one repeating cycle:

```
LISTEN → UNDERSTAND → DECIDE → CREATE → DISTRIBUTE → CONVERT → MEASURE → LEARN → ACT AGAIN
```

Its central, permanent question is:

> **"What should SecurePay do next, and why?"**

Every capability the Outreach Engine builds — intelligence gathering, campaign
planning, creative production, distribution, attribution, analytics — exists
to answer that question with evidence, and to make the "why" traceable.

Outreach Engine is **not** SecurePay's product. It is the system SecurePay
uses to understand its market, protect its positioning, and decide what
commercial action to take next. It does not process SecurePay's core payment
or agreement flows; it observes and acts on the commercial layer around them.

## 2. The Five Locked Pillars

There are exactly five commercial pillars. This list is fixed and is not to
be expanded without an explicit doctrine change and a corresponding ADR.

1. **MARKETING** — Find and communicate real problems SecurePay can solve.
2. **POSITIONING** — Protect how SecurePay is understood. See
   [SECUREPAY_POSITIONING_RULES.md](SECUREPAY_POSITIONING_RULES.md).
3. **DISTRIBUTION** — Determine who should hear the message and through which
   channels (paid ads, organic, businesses, partners, platforms, developers,
   direct outreach).
4. **IMPACT** — Measure what actually happened (registrations, KSNumbers,
   SecureLinks, KeyContracts, completed agreements, repeat use, referrals,
   business adoption, campaign attribution).
5. **ACTION** — Determine the next best commercial action based on evidence.

**Growth Director is not a sixth pillar.** It is the supervising intelligence
layer that reasons across all five pillars. See ADR-008.

## 3. Doctrine Principles

These principles govern every phase of the build, not just Phase 0:

1. **Evidence before action.** Recommendations and campaigns must be traceable
   to intelligence with known provenance, not vibes.
2. **Human approval by default.** AI expands what can be *proposed*, not what
   can be *executed* without oversight, for consequential external actions.
   See [AI_GOVERNANCE.md](AI_GOVERNANCE.md).
3. **Provider and model agnosticism.** SecurePay is never locked into one AI
   vendor. See [MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md).
4. **Provenance is mandatory.** Every intelligence conclusion must be traceable
   to a source. See [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md).
5. **Least privilege by role.** Access is scoped to what a role needs to do
   its job. See [ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md).
6. **Reversibility.** The system must be safely stoppable at any time without
   losing historical data or audit trails. See
   [AUDIT_AND_CONTROL.md](AUDIT_AND_CONTROL.md).
7. **Lean phases.** The roadmap has exactly six phases. See
   [ROADMAP.md](ROADMAP.md). It is not to be expanded into a long tail of
   micro-phases.
8. **Positioning discipline.** SecurePay must never be marketed, described, or
   inferred as a wallet, a bank, an M-PESA competitor, another payment app, or
   an escrow product. See [SECUREPAY_POSITIONING_RULES.md](SECUREPAY_POSITIONING_RULES.md).

## 4. What Phase 0 Establishes

Phase 0 is documentation and architecture only. It answers the questions that
must be answered before any code that touches real data, real spend, or real
audiences is written:

- What is Outreach Engine and what are its five pillars?
- What can AI do, and what must require human approval?
- Who can see what (RBAC)?
- How will AI providers remain replaceable?
- How will we know which AI/model performed a task?
- How will intelligence preserve source provenance?
- How will cost be controlled?
- How can the system be stopped safely?
- How do we keep a future read-only Analytics API possible without building
  it now?

Phase 0 does not implement authentication, databases, AI calls, or
integrations. Those begin in Phase 1 onward per [ROADMAP.md](ROADMAP.md).

## 5. Explicitly Out of Scope for Phase 0 (and until their phase)

- No n8n, Clay, HubSpot, Meta, Google Ads, OpenAI, Anthropic, Gemini, or other
  social/AI integrations are wired up yet.
- No credentials, API keys, or secrets are required or stored.
- No production application code, database, or infrastructure is deployed.
- No commercial memory, audience engine, or journey recovery engine is built —
  only documented as future architecture.

## 6. Document Map

| Document | Purpose |
|---|---|
| [OUTREACH_ENGINE_DOCTRINE.md](OUTREACH_ENGINE_DOCTRINE.md) | This document — purpose, pillars, principles |
| [SECUREPAY_POSITIONING_RULES.md](SECUREPAY_POSITIONING_RULES.md) | How SecurePay must and must not be described |
| [AI_GOVERNANCE.md](AI_GOVERNANCE.md) | What AI can and cannot do, risk tiers |
| [ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md) | RBAC roles and permissions |
| [DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md) | PUBLIC / INTERNAL / CONFIDENTIAL / RESTRICTED |
| [MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md) | Provider/model abstraction and metadata |
| [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md) | Intelligence source tracking model |
| [AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](AUDIENCE_AND_CONVERSION_ARCHITECTURE.md) | Future commercial memory, journey recovery, paid media, creative |
| [AUDIT_AND_CONTROL.md](AUDIT_AND_CONTROL.md) | Audit events, Safe Mode / kill switch |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and technology recommendation |
| [ROADMAP.md](ROADMAP.md) | Six-phase build roadmap |
| [PHASE_0_COMPLETION_REPORT.md](PHASE_0_COMPLETION_REPORT.md) | Record of what Phase 0 delivered |
| [adr/](adr/) | Lightweight Architecture Decision Records |
