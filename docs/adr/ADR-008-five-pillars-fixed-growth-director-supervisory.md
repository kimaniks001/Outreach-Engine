# ADR-008: Five Pillars Are Fixed; Growth Director Is Supervisory, Not a Sixth Pillar

Status: Accepted
Date: 2026-08-10

## Context

Without a fixed structure, "commercial operating system" scope can expand
indefinitely. The product needs a small, stable set of pillars to organize
around, and a clear answer to whether the Growth Director concept is another
pillar or something else.

## Decision

There are exactly five commercial pillars: MARKETING, POSITIONING,
DISTRIBUTION, IMPACT, ACTION (see
[OUTREACH_ENGINE_DOCTRINE.md](../OUTREACH_ENGINE_DOCTRINE.md) Section 2).
Growth Director is the supervising intelligence layer that reasons across
all five pillars to answer "what should SecurePay do next, and why?" — it is
not a sixth pillar, and does not get its own pillar-level scope.

## Consequences

- New capabilities get placed inside one of the five existing pillars (or
  inside Growth Director's cross-pillar reasoning), not used to justify a
  new pillar.
- Growth Director's implementation (Phase 5) depends on the other five
  pillars already producing structured, attributable data — it has nothing
  to supervise otherwise.
- Changing this structure requires a new ADR superseding this one, not an
  incremental scope creep.
