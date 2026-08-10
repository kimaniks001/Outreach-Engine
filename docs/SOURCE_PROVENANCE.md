# Source Provenance

Status: Phase 0 (Foundation)
Last updated: 2026-08-10

## 1. Purpose

Every intelligence item the Outreach Engine produces or ingests must be
traceable to where it came from, how confident we are in it, and whether it
has been checked. This document defines the required provenance fields and
verification states. It underpins the MARKETING and IMPACT pillars, and is a
precondition for trustworthy recommendations from the Growth Director (see
[OUTREACH_ENGINE_DOCTRINE.md](OUTREACH_ENGINE_DOCTRINE.md)).

No intelligence pipeline is built in Phase 0. This document defines the
schema Phase 2's market intelligence module must implement.

## 2. Required Provenance Fields

Every future intelligence item must carry:

- `source_name`
- `source_reference` (URL or equivalent reference)
- `retrieval_timestamp`
- `publication_timestamp` (where known)
- `source_type` (e.g. news article, industry report, social post, direct
  interview, internal data)
- `extracted_claim` (the specific claim taken from the source)
- `confidence` (a score or band reflecting how strongly the source supports
  the claim)
- `verification_status` (see Section 3)
- `model_or_provider_used` (which AI, if any, extracted or summarised the
  claim — see [MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md))
- `process_or_agent_used` (which pipeline/process produced the item)
- `contradictions` (links to conflicting claims/items, if any)
- `supporting_evidence` (links to corroborating claims/items, if any)

## 3. Verification States

Every intelligence item is in exactly one of these states at any time:

- **VERIFIED** — corroborated and considered reliable enough to inform
  recommendations without further caveat.
- **NEEDS_REVIEW** — captured but not yet checked by a human or a secondary
  source.
- **WEAK_EVIDENCE** — single-source, low-confidence, or from a source type
  known to be unreliable; usable only with explicit caveats.
- **REJECTED** — found to be false, unreliable, or superseded; retained for
  audit history but excluded from active recommendations.

State transitions should be logged (who/what changed the state and when),
consistent with [AUDIT_AND_CONTROL.md](AUDIT_AND_CONTROL.md).

## 4. Conclusions Without Sources

A user may be permitted to see an intelligence **conclusion** (a synthesised
insight) without being permitted to see the **confidential underlying
sources** that produced it. This lets, for example, a Strategist act on
"approved intelligence" (see
[ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md)) without being granted
access to CONFIDENTIAL-classified raw sources (see
[DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md)).

This is implemented as a visibility split on the `intelligence` resource
category: `conclusion` visibility and `raw_source` visibility are separate
grants, not a single all-or-nothing permission.

## 5. Why This Matters

- **Trust**: recommendations the Growth Director layer eventually produces
  are only as trustworthy as the provenance behind them.
- **Correction**: when a claim turns out to be wrong, provenance lets us find
  every downstream recommendation that relied on it.
- **Compliance**: source tracking supports later legal/compliance review of
  how a marketing or positioning claim was substantiated.

## 6. Non-Goals for Phase 0

Phase 0 does not implement an intelligence store, ingestion pipeline, or
verification workflow. It defines the schema and states those Phase 2
systems must implement from day one.
