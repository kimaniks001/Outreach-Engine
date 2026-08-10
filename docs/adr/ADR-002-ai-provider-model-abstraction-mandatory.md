# ADR-002: AI Provider/Model Abstraction Is Mandatory

Status: Accepted
Date: 2026-08-10

## Context

The product must not be hard-coded to Claude, GPT, Gemini, or any specific
model. AI quality, pricing, and availability shift quickly; the Outreach
Engine needs to be able to change which provider/model handles a task
without an application rewrite.

## Decision

All AI calls go through an AI Gateway → Model Router → provider adapter flow
(see [MODEL_CONTROL_PLANE.md](../MODEL_CONTROL_PLANE.md)). Task types are
routed to an approved provider/model by the Router; application code never
selects a provider/model directly. Every provider/model carries metadata
(status, credentials configured, capabilities, approved task types, quality,
latency, cost, structured-output reliability, human acceptance/rejection,
fallback rate).

## Consequences

- Enables side-by-side comparison and controlled fallback between models.
- Requires maintaining a small routing/metadata layer rather than calling a
  provider SDK inline.
- Model/provider changes for a task type require approval (see
  [MODEL_CONTROL_PLANE.md](../MODEL_CONTROL_PLANE.md) Section 8).
