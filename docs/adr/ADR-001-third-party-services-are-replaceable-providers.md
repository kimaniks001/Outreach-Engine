# ADR-001: Third-Party AI/Services Are Replaceable Providers

Status: Accepted
Date: 2026-08-10

## Context

The Outreach Engine will eventually depend on external AI providers and, in
later phases, ad and distribution platforms. Coupling application logic
directly to any one vendor's SDK or API shape creates lock-in, makes
switching costly, and exposes the product to a single vendor's outages,
pricing changes, or policy changes.

## Decision

Every third-party AI or service integration (AI providers, ad platforms,
future integrations such as n8n/Clay/HubSpot/Meta/Google Ads) is treated as
a **replaceable provider** behind an internal interface. Application code
depends on the interface, never on a vendor SDK directly.

## Consequences

- Adding or removing a vendor means adding/removing an adapter, not
  rewriting application logic.
- Slightly more up-front abstraction than calling a vendor SDK inline.
- See [MODEL_CONTROL_PLANE.md](../MODEL_CONTROL_PLANE.md) and
  [AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](../AUDIENCE_AND_CONVERSION_ARCHITECTURE.md)
  Section 5 for the AI and paid-media applications of this decision.
