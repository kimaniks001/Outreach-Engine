# AI Governance

Status: Phase 0 (Foundation)
Last updated: 2026-08-10

## 1. Purpose

This document defines what AI is allowed to do inside the Outreach Engine,
what it is never allowed to do without a human in the loop, and the risk
tiers used to make that judgment consistently as new capabilities are added
in later phases.

No AI provider is integrated in Phase 0. This document governs behavior that
will apply from Phase 1 onward (see [ROADMAP.md](ROADMAP.md)).

## 2. What AI May Initially Do

AI may:

- research
- analyse
- classify
- score
- summarise
- recommend
- draft

These are all internal, reviewable outputs. None of them, by themselves,
change anything a customer, prospect, or the public sees, or spend any money.

## 3. What AI Must NOT Initially Do

AI must not have unrestricted authority to:

- publish publicly
- send bulk outreach
- spend advertising money
- change pricing
- make legal/compliance claims
- change system doctrine
- change high-impact model routing

These actions require human approval every time, regardless of how confident
the AI's recommendation is. "Unrestricted authority" is the key phrase —
future phases may introduce narrowly scoped, explicitly approved automation
(see [ROADMAP.md](ROADMAP.md), Phase 5, "selective automation"), but that is
an opt-in exception process, not a default.

## 4. Action Risk Levels

Every AI-initiated or AI-assisted action falls into exactly one of three risk
tiers. Risk tier is a property of the action being taken, not of the AI
provider or model used.

### LOW

Internal analysis, classification, summarisation.

- Examples: tagging an intelligence item, summarising a batch of market
  signals, scoring a prospect against known criteria.
- Approval: none required. Output is internal and non-destructive.

### MEDIUM

Draft content, response suggestions, prospect scoring used to prioritise
outreach.

- Examples: drafting a social post for review, suggesting a reply to an
  inbound message, producing a ranked prospect list.
- Approval: reviewed by the relevant role before it moves downstream (e.g. a
  draft is not itself public; a suggested response is not itself sent). See
  [ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md) for who reviews what.

### HIGH

Public campaigns, bulk outreach, paid-media launch/spend, pricing
communication, legal/compliance-sensitive statements.

- Examples: publishing a campaign, sending outreach to a prospect list,
  launching or increasing a paid-media budget, any external statement that
  touches pricing or compliance.
- Approval: **mandatory human approval before execution, every time.** This
  is non-negotiable in Phase 0 through Phase 5 as currently scoped. Any
  future change to this rule requires a new ADR, not a configuration change.

## 5. Approval Is Enforced Server-Side

Risk-tier gating must be enforced in the backend, not only hinted at in the
UI. A HIGH-risk action must be blocked at the API/service layer if it lacks a
recorded human approval, consistent with
[ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md) Section 5.

## 6. Traceability

Every AI-assisted action must be attributable to the provider/model that
performed it, per [MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md), and every
AI-assisted intelligence conclusion must carry provenance, per
[SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md). Governance without
traceability is not enforceable.

## 7. Relationship to Safe Mode

Safe Mode (see [AUDIT_AND_CONTROL.md](AUDIT_AND_CONTROL.md)) is the emergency
override for this document: it lets an owner suspend AI agent execution and
all HIGH-risk action classes system-wide, independent of any per-action
approval state.

## 8. Non-Goals for Phase 0

Phase 0 does not implement an approval workflow engine, an AI Gateway, or any
AI provider integration. It defines the rules those systems must obey when
they are built starting in Phase 1.
