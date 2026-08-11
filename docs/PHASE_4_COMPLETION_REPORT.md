# Phase 4 Completion Report

Status: Phase 4 — Audience Memory, Attribution & Conversion
Last updated: 2026-08-11

## A. Starting Repository State

`main` contained Phase 0 (doctrine, ADRs), Phase 1 (Command Centre + AI
Core), Phase 2 (Intelligence + Campaign + Creative), and Phase 3
(Targeting + Distribution) — all merged and complete, HEAD `bf84759`
("Merge pull request #4 from
kimaniks001/begining-phase-3-targeting-distribution"). Confirmed via
`git checkout main && git pull` and a fresh read of `README.md`,
`docs/ROADMAP.md`, `docs/OUTREACH_ENGINE_DOCTRINE.md`,
`docs/ACCESS_CONTROL_MODEL.md`, `docs/DATA_CLASSIFICATION.md`,
`docs/AUDIT_AND_CONTROL.md`, `docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md`,
`docs/SOURCE_PROVENANCE.md`, `docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md`,
`docs/PHASE_3_COMPLETION_REPORT.md`, all 8 ADRs, and the full existing
implementation (`src/lib/db/schema.ts`, `src/lib/rbac/*`,
`src/lib/safe-mode/state.ts`, `src/lib/ai/*`, `src/lib/audience/*`,
`src/lib/distribution/*`, `scripts/seed.ts`) before writing any Phase 4
code.

**No contradiction between the Phase 4 brief and locked doctrine was
found.** Several reading decisions, not conflicts — see
`docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md` Sections 3-4,
following the exact precedent Phase 3 set for its own RBAC/data-handling
reading decisions.

## B. Branch

`begining-phase-4-audience-memory-attribution-conversion`, branched from
`main` at `bf84759`.

## C. Files / Migrations Added

56 files changed (~10,700 insertions). One new migration
(`drizzle/0005_spotty_strong_guy.sql`) adding 13 tables: `organizations`,
`audience_profiles`, `profile_identifiers`, `profile_links`,
`consent_records`, `suppression_records`, `touchpoints`, `product_events`,
`product_journeys`, `attribution_records`, `conversion_events`,
`next_best_actions`, `retargeting_eligibility`. Reused unchanged:
`campaigns`, `audience_segments`, `distribution_plans`,
`distribution_executions`, `audit_events`, `ai_usage_records`,
`ai_providers`/`ai_models`, `users`. No Phase 5 tables (no experiments,
ROI, or Growth Director state).

## D. Unified Audience Profile

`audience_profiles` + `src/lib/commercial-memory/profiles.ts`. Five
profile types (`ANONYMOUS`/`PERSON`/`BUSINESS`/`KSNUMBER`/`PARTNER`) that
evolve/upgrade — never silently downgrade. RESTRICTED fields
(`emailRef`/`phoneRef`/`ksNumberRef`) are hashed references (never raw
PII) and stripped from every API response/page for every role but OWNER
(`sanitizeProfileForRole`). No `anonymousIdentifiers` duplicated onto the
profile row — `profile_identifiers` is the single source of truth.

## E. Identity Resolution

`src/lib/commercial-memory/identity.ts`. Deterministic, exact-match only —
`profile_identifiers` enforces one owner per identifier globally via a
unique index. A collision between two known profiles merges them
(earlier-`firstSeenAt` wins as canonical; the other gets
`mergedIntoProfileId`, never deleted — prior anonymous history stays
queryable through the canonical chain). Every merge recorded in
`profile_links` with evidence and audited (`PROFILE_MERGED`). Manual
Owner unlink (`unlinkProfile`) reverses a merge and is audited
(`PROFILE_UNLINKED`). Uncertain/unrelated identifiers are never merged —
verified in `tests/phase4-identity.test.ts`.

## F. Organization Memory

`organizations` + `src/lib/commercial-memory/organizations.ts`. Lightweight
— legal/display name, sector, geography, website, business references, use
cases, a simple `relationshipStatus` (PROSPECT/ENGAGED/CUSTOMER/CHURNED),
and the reused lifecycle enum. Not a CRM pipeline: no deal stages, no
duplicated suppression mechanism (organization posture is derived from its
associated profiles, not stored separately).

## G. Touchpoint Model

`touchpoints` (append-oriented) + `src/lib/commercial-memory/touchpoints.ts`.
All 20 touchpoint types from the brief. `metadata` is a shallow,
20-key-capped string/number/boolean map — schema-level protection against
arbitrary free-form or sensitive payloads. Every touchpoint recorded
updates the profile's `lastSeenAt` and triggers a lifecycle recompute.

## H. Consent/Suppression

`consent_records`/`suppression_records` (both append-only) +
`src/lib/commercial-memory/consent.ts`. Centralized: no other code path
writes a consent row as a side effect of registration or product use.
Channel-scoped consent. Suppression is checked first, before any other
rule, in both the Next-Best-Action engine and retargeting eligibility —
structurally overrides everything downstream. Verified in
`tests/phase4-consent.test.ts` and live over HTTP (Section T's
suppression walkthrough below and in the test-and-validation report).

## I. Retention

Kept deliberately simple per the brief's own instruction:
`retentionClass`/`retentionUntil`/`legalHold` live directly on
`audience_profiles`. No purge/anonymize job is implemented (no background
job infrastructure exists in this codebase) — documented as a Phase 5+
candidate, not a Phase 4 gap, since the fields exist for a future engine to
consume.

## J. SecurePay Product-Event Ingestion

`src/lib/product-events/{schemas,ingest,auth}.ts` +
`POST /api/product-events`. Strict Zod validation; either a shared secret
header or an authenticated Owner session authorizes a call (no live
SecurePay credentials required to complete Phase 4); a narrow
`SYSTEM_API_PATHS` middleware carve-out lets an unauthenticated
system-to-system call reach the route handler, which still enforces the
real check (403 otherwise). Full design:
`docs/PHASE_4_PRODUCT_EVENT_INTEGRATION.md`.

## K. Event Idempotency

`product_events` unique index on `(source, idempotency_key)`, checked
before any mutation. A duplicate creates zero new rows anywhere and
returns `DUPLICATE` (HTTP 200), audited (`PRODUCT_EVENT_DUPLICATE`).
Verified in `tests/phase4-product-events.test.ts` (both the default and an
explicit idempotency key) and live over HTTP with a real
`POST /api/product-events` call sent twice.

## L. Journey Model

`product_journeys` + `src/lib/journeys/journeys.ts`. Eight journey types,
six statuses. At most one open (`STARTED`/`IN_PROGRESS`) journey per
(profile, journeyType) — a later event resumes it rather than duplicating.

## M. Abandonment Detection

`src/lib/journeys/abandonment.ts`. Deterministic, per-journey-type time
thresholds (1 hour for `DEMO` up to 7 days for `BUSINESS_ONBOARDING`/
`API_INTEGRATION`) — never instant. No scheduler exists in this phase; the
sweep runs on demand (the demo's `simulateElapsedTime()` helper). Neutral
language only — no personal/relationship inference exists anywhere in the
abandonment/resume code path. Verified in `tests/phase4-journeys.test.ts`.

## N. Lifecycle State Engine

`src/lib/commercial-memory/lifecycle.ts`. The exact locked lifecycle
(`UNKNOWN → REACHED → ENGAGED → INTERESTED → REGISTERED → FIRST_USE →
ACTIVE → HIGH_VALUE`, with `DORMANT`/`SUPPRESSED` overrides). Recomputed
from full history on every relevant event — deterministic, reproducible,
no ML, objective configurable thresholds. `KSNUMBER_CREATED` is
deliberately excluded from the FIRST_USE signal set (registering ≠ using)
— see Section V for the real bug this distinction fixed.

## O. Next-Best-Action

`src/lib/next-best-action/engine.ts`. Deterministic, fully explainable
(`reason`/`triggeringState`/`blockedActions`/`suppressionState`/
`ruleEngineVersion` on every row). An open abandoned journey always wins
(`RESUME_JOURNEY`); otherwise one rule per lifecycle state; `NO_ACTION` is
a first-class output. Suppression and no-eligible-channel are enforced by
a guard wrapper (`guardedDecision`) that structurally cannot be bypassed
by a new lifecycle rule. Optional AI narrative enrichment
(`src/lib/ai/tasks/explain-next-best-action.ts`, activating the
declared-but-unused `IMPACT_ANALYSIS` task type) can only append text,
never change the decision. Append-only persistence, same pattern as
`channel_recommendations`.

## P. Retargeting Eligibility

`src/lib/next-best-action/retargeting.ts`. A decision only — Phase 4 never
creates or launches a distribution plan. Checks suppression → consent →
recent-interaction window → frequency guard → channel-eligibility, in that
order. Unknown consent resolves to `NEEDS_REVIEW`, never a silent
`ELIGIBLE`.

## Q. Upsell/Cross-Sell Rules

Implemented inside the Next-Best-Action engine
(`evaluateUpsellCandidate()`) — two deterministic, observed-evidence
rules (repeated SecureLink → KeyContract upsell; Group SecureLink →
SecureFlow cross-sell). No product is ever recommended without qualifying
evidence — verified in `tests/phase4-nba.test.ts`.

## R. Attribution Engine

`src/lib/attribution/engine.ts` + `conversions.ts`. Four models
(`FIRST_TOUCH`/`LAST_TOUCH`/`LINEAR`/`MULTI_TOUCH`), each a pure,
reproducible function of the sorted eligible-touch list. Full touch
history preserved; nothing is overwritten. First-only conversion types
deduplicated per profile server-side.

## S. Conversion/Funnel Engine

`conversion_events` + `src/lib/attribution/funnel.ts`. The exact
milestone list from the brief; `value` is never fabricated. Profile-set
based funnel across 12 stages, optionally scoped to a campaign; three
deterministic drop-off diagnostics with a minimum-sample guard against
false alarms on small denominators. No Growth Director recommendation
layer — only observable findings with exact ratios cited.

## T. RBAC

No new resource category or grant added. `audience` (already documented
in doctrine as covering future commercial memory) gates
profiles/organizations/touchpoints/consent/suppression/journeys/
next-best-action/retargeting; `analytics` gates
attribution/conversion/funnel. Verified in `tests/phase4-rbac.test.ts` and
live over HTTP: `CONTENT_ENGAGEMENT` 403 on `GET /api/profiles`; `ANALYST`
403 on `GET /api/profiles`, 200 on `GET /api/impact/summary`;
`DISTRIBUTION_SALES` 200 on `GET /api/profiles` (approved scope), 403 on
`POST /api/profiles` (create is Owner-only).

## U. Privacy / Data Classification

Full design: `docs/PHASE_4_PRIVACY_CONSENT_RETENTION.md`. RESTRICTED
fields (hashed email/phone references, KSNumber reference) are OWNER-only
regardless of `audience` capability scope; no raw PII stored anywhere;
`metadata` fields are schema-capped to prevent arbitrary sensitive data.

## V. Demo Scenario

`scripts/seed.ts::seedPhase4DemoScenario()` — the exact numbered
construction-demo journey from the brief, continuing the Phase 2/3
campaign. Every step calls the real service layer (identity resolution,
touchpoint recording, the product-event simulator, elapsed-time
simulation for abandonment) — nothing is a raw insert. Idempotent
(verified via two consecutive `npm run db:seed` runs producing identical
row counts). Self-verifying: the script asserts the expected
`RESUME_JOURNEY` recommendation and `FIRST_USE`/`ACTIVE` lifecycle
transitions, and this self-check is what caught two of the four real bugs
found during this build (Section 2 of the test report): a lifecycle
miscount (`KSNUMBER_CREATED` wrongly counted as FIRST_USE, skipping
REGISTERED) and a stale `RESUME_JOURNEY` recommendation that persisted
after the underlying journey type was actually completed. Both fixed
before this report, then re-verified end to end.

## W. Exact Test Counts

**213 tests passing, 7 skipped, across 20 passing test files** (`npm
test`) — 61 new Phase 4 tests (`tests/phase4-rbac.test.ts` 9,
`tests/phase4-identity.test.ts` 8, `tests/phase4-consent.test.ts` 6,
`tests/phase4-product-events.test.ts` 7, `tests/phase4-journeys.test.ts`
9, `tests/phase4-attribution.test.ts` 9, `tests/phase4-nba.test.ts` 13)
plus the full unmodified Phase 0-3 suite (152 tests, all still passing —
2 pre-existing E2E files conditionally skip, unchanged from Phase 1, not
a Phase 4 regression). Full brief-requirement-to-test mapping in
`docs/PHASE_4_TEST_AND_VALIDATION_REPORT.md` Section 1.

## X. E2E / Manual Validation

No browser-automation tool is installed (same as Phase 1-3). Full manual
walkthrough performed live via `curl` against a running `npm run dev`
server: Owner flow (profile list/detail with full journey/touchpoint/
conversion/NBA/retargeting data, real product-event ingestion via the
authenticated boundary with a verified duplicate-rejection follow-up,
Impact summary/funnel), suppression flow (apply → verify SUPPRESS + not
eligible → remove → verify lifecycle restored), RBAC denial flow (3
roles), and the product-event auth-boundary flow (unauthenticated → 403,
not 401 — confirming the middleware carve-out reaches real auth logic).
Every `/audiences` tab and the profile detail page and `/impact` returned
HTTP 200 with zero server errors in the dev log. Full detail, including
all four bugs found and fixed during this build, in
`docs/PHASE_4_TEST_AND_VALIDATION_REPORT.md` Sections 2-3.

## Y. Lint / Typecheck / Build / Secret Scan

All clean: `npm run lint` (0 errors), `npx tsc --noEmit` (0 errors),
`npm run build` (succeeds — 47 static/dynamic pages/API routes, 26 new
Phase 4 API routes alongside 37 unchanged Phase 0-3 routes),
`git diff --check` (clean), and a manual grep for API-key/secret/password
literals across the full diff (none found; the one new optional env var,
`PRODUCT_EVENT_INGESTION_SECRET`, is documented empty in `.env.example`).

## Z. Known Limitations, Deferred Phase 5 Work, Commit SHA, Draft PR URL, CI State

**Known limitations:**

- **Four real bugs were found and fixed during this build**, not before
  it — disclosed in `docs/PHASE_4_TEST_AND_VALIDATION_REPORT.md` Section
  2 rather than omitted: a lifecycle miscount, a stale RESUME_JOURNEY
  recommendation, an enum/table SQL name collision (caught immediately by
  a failed, cleanly-rolled-back migration), and a demo profile missing a
  realistic eligible channel.
- No background job scheduler exists, so abandonment sweeps and dormancy
  sweeps run on demand rather than on a cron — acceptable for Phase 4's
  scope (no autonomous execution is permitted anyway) but a reasonable
  Phase 5+ candidate.
- Retention fields (`retentionClass`/`retentionUntil`/`legalHold`) exist
  but no purge/anonymize job consumes them yet — documented in
  `docs/PHASE_4_PRIVACY_CONSENT_RETENTION.md` as an intentional
  simplification, not a claim of full data governance.
- No organization-detail page/route beyond the list tab and the
  `GET /api/organizations/[id]` API — a reasonable deferred-scope
  decision, not a missing capability (the API exists and is tested via
  the RBAC suite's grant-table checks).
- `LIFECYCLE_CONFIG`/`FREQUENCY_GUARD_CONFIG` thresholds are hardcoded
  constants rather than `system_settings`-backed configuration — objective
  and documented, but not yet Owner-editable without a code change.

**Deferred Phase 5+ work:** everything in the brief's Section 46
Non-Goals list — autonomous Growth Director reasoning, autonomous
campaign/budget optimization, autonomous retargeting sends, live
WhatsApp/email sending, full CRM replacement, HubSpot/Clay/n8n, public
Analytics API, data warehouse, model benchmarking/self-switching,
multi-agent orchestration, community features. Confirmed absent by direct
code review and grep — see
`docs/PHASE_4_TEST_AND_VALIDATION_REPORT.md` Section 6.

**Commit SHA:** `7c9d001e9eede3c16316716d061006bafd562df2` — "Phase 4:
Audience Memory, Attribution + Conversion" (on
`begining-phase-4-audience-memory-attribution-conversion`, parent
`bf84759` on `main`).

**Draft PR URL:** see the draft PR opened from this branch into `main`.

**CI State:** no CI is configured on this repository (confirmed via
absence of `.github/workflows/`) — not applicable, same as Phase 0-3.

## Final Classification

**PHASE 4 COMPLETE — READY FOR REVIEW**
