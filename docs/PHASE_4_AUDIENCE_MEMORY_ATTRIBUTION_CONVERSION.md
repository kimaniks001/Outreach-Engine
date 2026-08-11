# Phase 4: Audience Memory, Attribution & Conversion

Status: Phase 4 — implemented
Last updated: 2026-08-11

## 1. Purpose

Phase 4 turns the Outreach Engine from a campaign/distribution system into a
commercial-memory and conversion system. It proves:

```
REACH → ENGAGEMENT → IDENTITY → PRODUCT BEHAVIOR → ATTRIBUTION
      → JOURNEY STATE → NEXT-BEST-ACTION → CONVERSION / RETENTION / UPSELL
```

No Growth Director reasoning, autonomous optimization, or autonomous
outreach is built here — those remain Phase 5, per `docs/ROADMAP.md`.

## 2. Repository Inspection Before Implementation

Read before writing any code: `README.md`, `docs/ROADMAP.md`,
`docs/OUTREACH_ENGINE_DOCTRINE.md`, `docs/ACCESS_CONTROL_MODEL.md`,
`docs/DATA_CLASSIFICATION.md`, `docs/AUDIT_AND_CONTROL.md`,
`docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md`, `docs/SOURCE_PROVENANCE.md`,
`docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md`,
`docs/PHASE_3_COMPLETION_REPORT.md`, all 8 ADRs, and the full existing
implementation (`src/lib/db/schema.ts`, `src/lib/rbac/*`,
`src/lib/safe-mode/state.ts`, `src/lib/ai/*`, `src/lib/audience/*`,
`src/lib/distribution/*`, `scripts/seed.ts`). **No contradiction between
this phase's brief and locked doctrine was found.** Several reading
decisions were required, following the exact precedent Phase 3 set — see
Section 3.

## 3. RBAC Reading Decision (Not a Doctrine Change)

`docs/ACCESS_CONTROL_MODEL.md` Section 3 already documents `audience` as
covering "the future commercial-memory resource too," and Section 4's
grant table is unchanged since Phase 0. This build applies it literally,
with **no new resource category and no new grant**:

- **`audience`** gates every commercial-memory write/read: unified audience
  profiles, organizations, profile identifiers/links, touchpoints,
  consent/suppression, product journeys, next-best-action, retargeting
  eligibility. Only OWNER has `create`/`edit`; GROWTH_DIRECTOR has `view`
  (full scope); STRATEGIST/DISTRIBUTION_SALES have `view` (approved scope);
  CONTENT_ENGAGEMENT/ANALYST have none — identical to the Phase 3 audience
  segment pattern.
- **`analytics`** gates IMPACT-pillar output: attribution records,
  conversion events, funnel summaries, drop-off diagnostics, the Impact
  dashboard. OWNER full; GROWTH_DIRECTOR full view; STRATEGIST/
  DISTRIBUTION_SALES approved view; CONTENT_ENGAGEMENT basic view; ANALYST
  approved, read-only view; no capability to mutate a profile.

This resolves every RBAC requirement in the brief's Section 33 without a
gap: DISTRIBUTION_SALES sees approved-scope commercial memory for
follow-up (`audience` approved); ANALYST sees read-only approved analytics
with private identifiers minimized (`analytics` approved — ANALYST never
gets `audience` access at all, so it never sees a profile record, only
aggregate attribution/funnel numbers); CONTENT_ENGAGEMENT sees only
basic-scope analytics, never raw contact identifiers or profile records.

## 4. Data-Classification Reading Decision

`docs/DATA_CLASSIFICATION.md` Section 2 defines RESTRICTED as "highest
sensitivity... limited to Owner/Super Admin." `audience_profiles.emailRef`/
`phoneRef`/`ksNumberRef` are RESTRICTED-shaped fields even though role
grants a non-Owner role `view` on `audience` at some scope — capability
grants visibility into commercial-memory *conclusions* (lifecycle state,
touch history, journeys), not RESTRICTED raw identifiers. Enforced by
`src/lib/commercial-memory/profiles.ts::sanitizeProfileForRole`, called by
every profile-returning API route and page — strips those three fields for
every role except OWNER, regardless of the caller's `audience` scope.
`emailRef`/`phoneRef` are additionally never stored raw: they are SHA-256
references (`src/lib/commercial-memory/identity.ts::hashIdentifier`), so
even an OWNER never sees the original email/phone, only a stable reference
that lets the same person resolve to the same profile.

## 5. Commercial Memory Domain

New top-level domain `src/lib/commercial-memory/` — deliberately separate
from `src/lib/audience/` (Phase 3 targeting segments) and
`src/lib/intelligence/` (market intelligence), per ADR-006 ("commercial
memory is a distinct store/domain from raw intelligence").

- `identity.ts` — deterministic identity resolution/merge/unlink.
- `profiles.ts` — profile reads, RESTRICTED-field redaction, manual
  profile creation.
- `organizations.ts` — lightweight organization/business memory.
- `touchpoints.ts` — append-oriented commercial touch history.
- `consent.ts` — centralized consent + suppression policy.
- `lifecycle.ts` — deterministic lifecycle state engine.

## 6. Unified Audience Profile

`audience_profiles`. Profile types: `ANONYMOUS`, `PERSON`, `BUSINESS`,
`KSNUMBER`, `PARTNER`. Fields match the brief's Section 7 list exactly,
with two simplifications: no `anonymousIdentifiers` array on the profile
row itself (the `profile_identifiers` table is the single source of truth
for every identifier a profile is known by, avoiding a second place that
could drift out of sync), and retention fields (`retentionClass`/
`retentionUntil`/`legalHold`) live on the profile row rather than a
separate table (Section 22 explicitly asks to avoid enterprise
data-governance complexity).

## 7. Identity Resolution

`src/lib/commercial-memory/identity.ts`. Deterministic, exact-match only:

- Candidate identifiers: `KSNUMBER`, `EMAIL_REF` (hashed), `PHONE_REF`
  (hashed), `SESSION_TOKEN`, `CAMPAIGN_CLICK_REF`, `PARTNER_REF`. Each is
  globally unique in `profile_identifiers` (one owner at a time).
- **No speculative fuzzy matching** — profiles are never merged because
  names look similar; matching is purely identifier-collision based.
- A collision (an identifier already owned by a different profile) merges
  the two profiles: the earlier-created (`firstSeenAt`) profile is
  canonical; the other gets `mergedIntoProfileId` set — **never deleted**,
  so prior anonymous history is preserved and still queryable through the
  canonical chain (`resolveCanonicalProfileId`).
- Every merge is recorded in `profile_links` (`action: "MERGE"`) with the
  triggering evidence, and audited (`PROFILE_MERGED`).
- `unlinkProfile()` (Owner-only, called from `POST
  /api/profiles/[id]/unlink`) reverses a merge, recording an `UNLINK` row
  and a `PROFILE_UNLINKED` audit event.
- Profile type can only be **upgraded** from `ANONYMOUS` once a stronger
  identifier is known — never silently downgraded.

## 8. Organization Memory

`organizations` + `audience_profiles.organizationId`. Deliberately not a
CRM pipeline: no deal-value tracking, no pipeline stages beyond a simple
`relationshipStatus` (`PROSPECT`/`ENGAGED`/`CUSTOMER`/`CHURNED`), no
sales-activity log beyond what touchpoints/conversions already capture per
associated profile. Organization-level suppression/consent is
deliberately **not** a separate mechanism — profiles (the entities
actually contacted) carry consent/suppression; an organization's aggregate
posture is derivable by checking its associated profiles, not duplicated
onto the organization row.

## 9. Commercial Touchpoints

`touchpoints` (append-oriented). All 20 touchpoint types from Section 12.
`metadata` is a shallow `Record<string, string|number|boolean>` — no
nested objects, no arrays — so no arbitrary free-form or sensitive payload
can be smuggled through it (enforced at the schema level, reinforced by
Zod in the product-event ingestion boundary). Every `recordTouchpoint()`
call updates the profile's `lastSeenAt` and recomputes lifecycle state.

## 10. Lifecycle State Engine

`src/lib/commercial-memory/lifecycle.ts`. The exact locked lifecycle:
`UNKNOWN → REACHED → ENGAGED → INTERESTED → REGISTERED → FIRST_USE →
ACTIVE → HIGH_VALUE`, with `DORMANT` and `SUPPRESSED` as override states.

Deliberately **not** an incremental state machine — `assessLifecycle()` is
a pure function of the profile's full touchpoint/journey/conversion/
suppression history, recomputed from scratch on every call
(`recomputeLifecycle()`, invoked after every touchpoint, journey
transition, product event, and suppression change). This avoids an entire
class of event-ordering bugs an incremental transition table would be
exposed to, and keeps every classification reproducible and explainable
(every result carries `reasons: string[]`). Thresholds
(`LIFECYCLE_CONFIG`) are hardcoded constants — objective, not ML — a
reasonable Phase 5+ candidate for moving to `system_settings`.
`KSNUMBER_CREATED` is deliberately excluded from the FIRST_USE signal set
— registering (`REGISTERED`) is not yet "using" (`FIRST_USE`), matching
`docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md` Section 3's own wording. A
real bug of exactly this shape (`KSNUMBER_CREATED` incorrectly counted as
a FIRST_USE conversion type, skipping the `REGISTERED` state entirely) was
found by `tests/phase4-product-events.test.ts` and fixed before this
report — see the completion report's Known Limitations / bugs-found
section.

## 11. Consent & Suppression

`src/lib/commercial-memory/consent.ts`. `consent_records` and
`suppression_records` are both append-only; current state is always the
latest row. **No code path writes a consent row as a side effect of
registration, product use, or any other action** — consent is only ever
recorded by an explicit `POST /api/profiles/[id]/consent` call. Consent is
channel-scoped (a `null` channel row is general marketing consent, used
only as a fallback when no channel-specific row exists) — granting EMAIL
consent never implies WHATSAPP consent.

Suppression overrides next-best-action, retargeting, and outreach planning
everywhere those are computed — `computeNextBestAction()` and
`evaluateRetargetingEligibility()` both check `isSuppressed()` first and
short-circuit to `SUPPRESS`/`NOT_ELIGIBLE` before any other rule runs.
Verified live over HTTP (Section T of the completion report) and in
`tests/phase4-consent.test.ts`.

## 12. Product Event Ingestion

See `docs/PHASE_4_PRODUCT_EVENT_INTEGRATION.md` for the full boundary,
idempotency, and simulator design.

## 13. Product Journeys

`product_journeys` (`src/lib/journeys/journeys.ts`). Statuses: `STARTED`,
`IN_PROGRESS`, `COMPLETED`, `ABANDONED`, `CANCELLED`, `EXPIRED`. At most
one `STARTED`/`IN_PROGRESS` journey per (profile, journeyType) is
"open" — a later event for the same type resumes the open one rather than
creating a duplicate.

## 14. Abandoned Journey Detection

`src/lib/journeys/abandonment.ts`. Deterministic, type-specific time
thresholds (`ABANDONMENT_THRESHOLD_MINUTES`) — never instant (a `DEMO`
abandons after 1 hour of inactivity, `BUSINESS_ONBOARDING`/
`API_INTEGRATION` after 7 days). No scheduler exists in this phase (no
background job infrastructure); `sweepAbandonedJourneys()` runs on demand
(the demo/simulator's "advance elapsed time" helper, or a future Phase 5+
cron). Recommendation language is neutral — `abandonJourney()` never
infers emotional or personal context, matching Section 16's explicit
"someone you trust," never "your girlfriend," instruction (enforced by
never generating such text in the first place — no free-text personal
inference exists anywhere in this codebase).

## 15. Next-Best-Action Engine

`src/lib/next-best-action/engine.ts`. Deterministic and fully explainable
— every recommendation records `reason`, `triggeringState`,
`blockedActions`, `suppressionState`, `eligibleChannels`,
`ruleEngineVersion`, and `generatedByUserId`/`aiNarrativeUsed`. Priority
reuses the existing `urgencyEnum` (LOW/MEDIUM/HIGH) rather than a new
enum. Rules match Section 17 exactly: an open abandoned journey always
wins (`RESUME_JOURNEY`, highest priority, checked before any lifecycle
rule); otherwise one rule per lifecycle state (`REACHED`→`EDUCATE`,
`REGISTERED` with no open journey → `CREATE_FIRST_PRODUCT`, `FIRST_USE` →
`REPEAT_USE`, `ACTIVE`/`HIGH_VALUE` → qualified `UPSELL`/`CROSS_SELL` only
with observed evidence, or `NO_ACTION`/`BUSINESS_CONTACT` otherwise).
`NO_ACTION` is a first-class output, not an absence of a row. `SUPPRESS`
and no-eligible-channel both force `NO_ACTION`/`SUPPRESS` regardless of
what the lifecycle rule would otherwise say — this "guard wraps decision"
structure (`guardedDecision()`) is what makes suppression/consent/
frequency structurally impossible to bypass by adding a new lifecycle
rule later.

Append-only (`next_best_actions`) — every recompute inserts a fresh row;
current = latest row per profile, same non-destructive pattern as
`channel_recommendations`/`budget_approvals`.

A real bug was found and fixed here during validation: an `ABANDONED`
journey kept recommending `RESUME_JOURNEY` forever even after the same
journey type was later completed via a fresh instance (because the
original abandoned row's status never changes once a *different* journey
row of the same type completes it). Fixed by excluding abandoned journeys
whose `journeyType` has since been completed by any instance — see the
completion report.

## 16. Upsell / Cross-Sell

Implemented as a sub-check inside the Next-Best-Action engine
(`evaluateUpsellCandidate()`), not a separate module — the brief's three
examples map to two deterministic, observed-evidence rules: ≥2
`SECURELINK_CREATED` touchpoints with no `KEYCONTRACT_CREATED` yet →
`UPSELL` (KeyContract); ≥1 `GROUP_SECURELINK_CREATED` touchpoint with no
`SECUREFLOW_CREATED` yet → `CROSS_SELL` (SecureFlow). Products are never
recommended merely because they exist — no evidence, no recommendation
(verified in `tests/phase4-nba.test.ts`: an ACTIVE user with zero
repeat-use evidence gets `NO_ACTION`, not an upsell).

## 17. AI Usage for Next-Best-Action

`src/lib/ai/tasks/explain-next-best-action.ts` activates the
declared-but-unused `IMPACT_ANALYSIS` task type (present since Phase 1).
Same authority pattern as Channel Recommendation's optional AI enrichment:
the deterministic engine decides everything; AI may only append one short
narrative sentence to `reason` (`recomputeNextBestAction({
useAiNarrative: true })`) — it structurally cannot change `actionType`,
`priority`, `eligibleChannels`, or any suppression/consent result, because
those are all already decided and passed into the enrichment call as
read-only context. The mock provider gained a deterministic `[MOCK]`
branch so this works with zero credentials.

## 18. Retargeting Eligibility

`src/lib/next-best-action/retargeting.ts`. A decision, never an automatic
execution — Phase 4 never creates or launches a Phase 3 distribution plan.
Checks, in order: suppression → consent (channel-specific, falling back to
general) → relevant recent interaction (180-day window) → frequency guard
→ requested-channel-known-eligible. Outputs `ELIGIBLE` / `NOT_ELIGIBLE` /
`NEEDS_REVIEW`. Unknown consent never silently resolves to `ELIGIBLE` — it
resolves to `NEEDS_REVIEW`, matching Section 21's "membership is not
consent" principle (verified in `tests/phase4-nba.test.ts`).

## 19. Frequency / Fatigue Guard

`src/lib/next-best-action/frequency-guard.ts` — shared by both the
Next-Best-Action engine and retargeting eligibility so both apply the
identical cap: minimum 3-day interval between outreach touches, maximum 3
outreach touches in a 30-day window. Configurable constants, not ML.

## 20. Attribution Engine

`src/lib/attribution/engine.ts`. Four models, all pure functions of the
sorted eligible-touch list (only marketing/distribution touchpoint types
earn credit — product-milestone touchpoints like `KSNUMBER_CREATED`
represent the conversion itself, not a step toward it):

- `FIRST_TOUCH` — 100% to the earliest touch.
- `LAST_TOUCH` — 100% to the latest touch.
- `LINEAR` — equal split across every touch.
- `MULTI_TOUCH` — position-based ("U-shaped"): 40% first, 40% last, 20%
  split across any touches in between (graceful 1-2-touch fallback).

Reproducible by construction — no randomness, no external state.
`src/lib/attribution/conversions.ts::recordConversionEvent()` computes and
persists all four models for every conversion in one call, preserving the
full touch history (never overwritten). "First-only" conversion types
(`KSNUMBER_CREATED`, `FIRST_SECURELINK`, `FIRST_KEYCONTRACT`,
`FIRST_GROUP_SECURELINK`, `FIRST_SECUREFLOW`) are deduplicated per profile
server-side; `REPEAT_USE`/`PAYMENT_COMMITTED`/`AGREEMENT_COMPLETED`/
`SETTLEMENT_COMPLETED` are not first-only and each occurrence is recorded.

## 21. Conversion Events & Funnel

`conversion_events` — the exact Section 24 milestone list. `value` is
`null` unless a real monetary figure is known — no fabricated revenue.
`src/lib/attribution/funnel.ts::computeFunnelSummary()` builds
profile-set-based funnel counts (did this profile reach this stage at
all — a different question from attribution weighting) across the
Section 25 stage list, optionally scoped to one campaign. Not every
campaign/channel needs every stage populated.
`computeDropOffFindings()` implements the three deterministic diagnostics
from Section 26 (reach→visit, KSNumber→product-created,
product-started→product-created), gated by a minimum sample size so a
tiny denominator never produces a false alarm. No Growth Director
recommendation is produced — only an observable finding with the exact
ratio cited.

## 22. Product Event Simulator

`src/lib/product-events/simulator.ts`. Deterministic, forces
`isDemo: true` and `source: "simulator"` on every event — never
confusable with real SecurePay activity. `simulateElapsedTime()` proves
abandonment detection without a real wait, by sweeping abandonment against
a shifted "now" rather than mutating any stored timestamp.

## 23. Demo Scenario

`scripts/seed.ts::seedPhase4DemoScenario()` — the exact Section 32
numbered flow, continuing the Phase 2/3 construction demo campaign. Every
step calls the real service layer (`resolveProfile`, `recordTouchpoint`,
`simulateProductEvent`, `simulateElapsedTime`) — nothing is a raw insert.
Idempotent (checked via a known `profile_identifiers` row). Self-verifying
— the script itself asserts the expected `RESUME_JOURNEY` recommendation
after simulated abandonment and the expected `FIRST_USE`/`ACTIVE`
lifecycle transitions, logging a warning if reality diverges from
expectation rather than silently trusting the happy path. This self-check
is what caught both real bugs documented in Sections 10 and 15 above,
before this report was written.

## 24. Command Centre / UI Updates

`/audiences` is now a tabbed workspace (Segments / Profiles / Organizations
/ Journeys / Suppression / Attribution) — Segments preserves the exact
Phase 3 content; the five new tabs are Phase 4. `/audiences/profiles/[id]`
is the profile detail page (Section 29): lifecycle, first/last seen,
organization, campaign touches, product journeys, conversion milestones +
attribution breakdown, next-best-action with blocked-actions
explainability, consent/suppression, eligible channels — RESTRICTED
identifiers only rendered for OWNER. `/impact` now shows real Phase 4
data (Section 30): reached/engaged/KSNumbers/first-uses/agreements/repeat
users, the full funnel table, drop-off diagnostics, and conversions by
campaign/channel — no fabricated revenue anywhere.

## 25. API Boundary

`src/app/api/{profiles,organizations,touchpoints,product-events,journeys,
attribution,impact}/**` — see `docs/PHASE_4_PRODUCT_EVENT_INTEGRATION.md`
for the ingestion boundary specifically. Every route is RBAC-gated via
`requireApiCapability`; no public unrestricted API; no public analytics
API (impact/attribution routes require an authenticated session with
`analytics` view).

## 26. Non-Goals (confirmed not built)

Matches the brief's Section 46 list exactly: no autonomous Growth Director
reasoning, no autonomous campaign optimization or budget reallocation, no
autonomous retargeting sends, no live WhatsApp/email sends, no CRM
replacement, no HubSpot/Clay/n8n, no public Analytics API, no data
warehouse, no model benchmarking or self-switching, no multi-agent
orchestration, no community features. Confirmed by direct code review and
grep — see `docs/PHASE_4_TEST_AND_VALIDATION_REPORT.md`.
