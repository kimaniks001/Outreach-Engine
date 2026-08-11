# Phase 4: Privacy, Consent & Retention

Status: Phase 4 — implemented
Last updated: 2026-08-11

## 1. Purpose

Documents how Phase 4 applies `docs/DATA_CLASSIFICATION.md` and the
"commercial memory principle" (brief Section 6) — the system should
remember enough to improve commercial decisions, but never become an
uncontrolled surveillance system.

## 2. Data Minimization

- **No raw PII stored where a reference/hash suffices.** `emailRef`/
  `phoneRef` on `audience_profiles` are SHA-256 references
  (`src/lib/commercial-memory/identity.ts::hashIdentifier`), never the
  original email/phone string. The original value is never written to any
  table.
- **`ksNumberRef`** is stored as given (a KSNumber is already a reference
  token, not raw contact PII, per doctrine).
- **No unrelated behavioral profiling.** Touchpoint `metadata` is a
  shallow, capped string/number/boolean map — no free-form fields exist
  anywhere in the commercial-memory schema for recording arbitrary
  personal detail.
- **No inferred private relationships or personal situations.** No field
  in `audience_profiles`, `touchpoints`, `product_journeys`, or
  `next_best_actions` records a relationship, emotional state, or
  personal-situation inference. Journey resume language is generated from
  neutral, fixed templates (`src/lib/next-best-action/engine.ts`) — never
  free text about the person.
- **No hidden identity resolution.** Every merge is deterministic
  (exact-identifier collision only), recorded in `profile_links` with the
  triggering evidence, and audited (`PROFILE_MERGED`) — see
  `docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md` Section 7.

## 3. RESTRICTED Field Access

`emailRef`, `phoneRef`, `ksNumberRef` are stripped from every API response
and every rendered page for every role except OWNER
(`src/lib/commercial-memory/profiles.ts::sanitizeProfileForRole`),
regardless of that role's `audience` capability scope — see the
architecture doc's Section 4 for the full reasoning. This is checked in
`tests/phase4-rbac.test.ts` for every role in `ROLES`.

## 4. Consent

`consent_records` (append-only). Centralized: this is the **only** place
consent is recorded — no other code path (registration, product use,
campaign touch) writes a consent row as a side effect. Channel-scoped:
consent for one channel is never treated as consent for another. The
latest row per `(profileId, channel)` is authoritative; an unexpired
row's `expiresAt` is respected. See
`src/lib/commercial-memory/consent.ts::getEffectiveConsent`.

## 5. Suppression

`suppression_records` (append-only, `APPLIED`/`REMOVED` actions). Current
state = latest row's action. Suppression is checked **first**, before any
other rule, in both `computeNextBestAction()` and
`evaluateRetargetingEligibility()` — structurally impossible to bypass by
adding a new lifecycle rule downstream, because the suppression check
returns early before the lifecycle switch statement is ever reached.
Every apply/remove is audited (`SUPPRESSION_APPLIED`/
`SUPPRESSION_REMOVED`) with `reason`, `source`, and the acting user (or
`null` for a system-driven suppression).

## 6. Retention

Kept intentionally simple, per Section 22's explicit instruction not to
build enterprise data-governance complexity. `audience_profiles` carries:

- `retentionClass` (text, default `"standard"`) — a label, not an
  enforcement mechanism in this phase; a placeholder for a future
  retention-policy engine.
- `retentionUntil` (nullable timestamp) — when set, a future purge/anonymize
  job would use this as its cutoff. No such job is implemented in Phase 4
  (no background job infrastructure exists anywhere in this codebase yet).
- `legalHold` (boolean, default `false`) — when true, a future purge job
  must skip this profile regardless of `retentionUntil`.

Touchpoints/journeys/conversions do not carry their own retention columns
— they are always scoped to their parent profile's lifetime, avoiding a
second, potentially inconsistent set of retention rules to keep in sync.
This is a known simplification, not a Phase 4 claim of full data
governance — see the completion report's Known Limitations.

## 7. Classification Summary

| Data | Classification | Who can see it |
|---|---|---|
| Profile lifecycle state, touch history, journeys | CONFIDENTIAL | Roles with `audience` view (scope-limited) |
| `emailRef`/`phoneRef`/`ksNumberRef` | RESTRICTED | OWNER only |
| Attribution/conversion/funnel aggregates | CONFIDENTIAL (via `analytics`) | Roles with `analytics` view (scope-limited) |
| Organization public references (website, sector) | INTERNAL/PUBLIC-leaning | Roles with `audience` view |

No RESTRICTED field is ever returned by a general-purpose list API — every
profile-list and profile-detail response passes through
`sanitizeProfileForRole` before serialization.
