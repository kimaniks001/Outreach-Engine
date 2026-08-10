# ADR-007: A Narrow Read-Only Analytics API May Be Exposed Later

Status: Accepted
Date: 2026-08-10

## Context

Other tools or teams may eventually want programmatic read access to
Outreach Engine analytics (campaign performance, funnels, attribution,
impact metrics). Building this now would be premature — no analytics exist
yet — but the architecture should not preclude it later, and it must never
become a substitute for or extension of SecurePay's own API.

## Decision

The Outreach Engine may later expose a narrow, read-only Analytics &
Insights API (see [ARCHITECTURE.md](../ARCHITECTURE.md) Section 6 and
[ROADMAP.md](../ROADMAP.md) Phase 5). It will never expose doctrine, raw
intelligence sources, prompts, credentials, private audience profiles, or
internal model logic. The Outreach Engine and SecurePay's own API remain
separate products/domains; this API does not merge them.

## Consequences

- Backend architecture should keep analytics read-paths separable from
  mutation logic and from RESTRICTED-classification data from the start,
  even though the API itself is not built until Phase 5.
- No API is designed, versioned, or exposed before Phase 5.
