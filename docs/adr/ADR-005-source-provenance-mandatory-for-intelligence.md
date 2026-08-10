# ADR-005: Source Provenance Is Mandatory for Intelligence

Status: Accepted
Date: 2026-08-10

## Context

Recommendations the Outreach Engine produces are only as trustworthy as the
intelligence behind them. Without tracked provenance, a false or outdated
claim can silently propagate into campaigns and positioning decisions with
no way to trace or correct it.

## Decision

Every intelligence item must carry the provenance fields and verification
state defined in [SOURCE_PROVENANCE.md](../SOURCE_PROVENANCE.md) (source
name/reference, timestamps, source type, extracted claim, confidence,
verification status, model/process used, contradictions, supporting
evidence). Items without required provenance fields cannot be marked
VERIFIED.

## Consequences

- Slightly heavier intelligence ingestion (structured capture, not just raw
  text dumps).
- Makes it possible to find and correct every downstream recommendation that
  relied on a claim later found to be wrong.
- Enables the conclusion-without-raw-source visibility pattern in
  [ACCESS_CONTROL_MODEL.md](../ACCESS_CONTROL_MODEL.md) Section 6.
