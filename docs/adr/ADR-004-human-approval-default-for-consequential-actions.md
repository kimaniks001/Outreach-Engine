# ADR-004: Human Approval by Default for Consequential External Actions

Status: Accepted
Date: 2026-08-10

## Context

AI can draft, score, and recommend at a scale and speed no human team can
match, but AI-initiated errors in public-facing or spend-committing actions
(a bad campaign, an incorrect pricing claim, a mistaken bulk send, an
uncontrolled ad-spend increase) are hard to undo and can damage SecurePay's
market position (see
[SECUREPAY_POSITIONING_RULES.md](../SECUREPAY_POSITIONING_RULES.md)).

## Decision

HIGH-risk actions — public campaigns, bulk outreach, paid-media
launch/spend, pricing communication, legal/compliance-sensitive statements —
always require human approval before execution. This is the default and
remains the default through Phase 5 as currently scoped (see
[AI_GOVERNANCE.md](../AI_GOVERNANCE.md) Section 4). Any future move to allow
narrowly-scoped automation for a specific HIGH-risk action requires a new
ADR, not a configuration toggle.

## Consequences

- AI expands what can be proposed, not what can be executed unsupervised.
- Slower time-to-execution for HIGH-risk actions in exchange for lower blast
  radius from AI error.
- LOW and MEDIUM risk actions (internal analysis, drafts) are not subject to
  this gate, keeping day-to-day AI-assisted work fast.
