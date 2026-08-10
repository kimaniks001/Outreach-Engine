# ADR-006: Commercial Memory Is Separated From Raw Intelligence

Status: Accepted
Date: 2026-08-10

## Context

Market intelligence (about the market/industry in general) and commercial
memory (about specific, identifiable people/businesses SecurePay has
contacted or served) have different consent, suppression, and compliance
obligations. Mixing them into one store risks applying the wrong access
rules to the wrong data, and makes suppression (do-not-contact) harder to
guarantee.

## Decision

Commercial memory (see
[AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](../AUDIENCE_AND_CONVERSION_ARCHITECTURE.md)
Section 2) is architected as a distinct store/domain from raw intelligence
(see [SOURCE_PROVENANCE.md](../SOURCE_PROVENANCE.md)), even though
intelligence conclusions may inform commercial-memory decisions such as
next-best-action.

## Consequences

- Suppression/do-not-contact status can be enforced consistently at a single
  point rather than checked ad hoc across data stores.
- Slightly more integration work to connect intelligence conclusions to
  commercial-memory records when both are relevant.
- Neither system is implemented yet; this ADR fixes the design for Phase 4.
