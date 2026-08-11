# Phase 4 Test & Validation Report

Status: Phase 4 — Audience Memory, Attribution & Conversion
Last updated: 2026-08-11

## 1. Automated Test Suite

**213 tests passing, 7 skipped, across 20 passing test files** (`npm
test`) — 61 new Phase 4 tests across 7 files, plus the full unmodified
Phase 0-3 suite (152 tests, all still passing; the 2 pre-existing E2E
files conditionally skip, unchanged since Phase 1, not a Phase 4
regression).

| File | Tests | Covers |
|---|---|---|
| `tests/phase4-rbac.test.ts` | 9 | `audience`/`analytics` grant-table literal application, `sanitizeProfileForRole` RESTRICTED-field stripping for every role |
| `tests/phase4-identity.test.ts` | 8 | Deterministic profile creation/matching, uncertain identifiers stay separate, merge on exact collision, merge is audited + reconstructable, unlink reverses a merge, profileType never downgrades |
| `tests/phase4-consent.test.ts` | 6 | Registration ≠ consent, channel-scoped consent doesn't leak, latest record wins, suppression toggles, suppression overrides retargeting even with granted consent |
| `tests/phase4-product-events.test.ts` | 7 | Schema validation rejection, valid ingestion, lifecycle update (REGISTERED), journey start, duplicate idempotency (default + explicit key) |
| `tests/phase4-journeys.test.ts` | 9 | STARTED→IN_PROGRESS→COMPLETED, abandon reason recorded, threshold math, no instant abandonment, abandonment via shifted "now", completed journeys never resurrected |
| `tests/phase4-attribution.test.ts` | 9 | FIRST/LAST/LINEAR/MULTI_TOUCH weight math and reproducibility, multi-touch history preserved (8 rows for 3 touches × applicable models), first-only dedupe, REPEAT_USE not deduped |
| `tests/phase4-nba.test.ts` | 13 | Per-lifecycle deterministic rules, abandoned-journey priority, suppression forces SUPPRESS, no-channel forces NO_ACTION, qualified upsell/cross-sell only with evidence, irrelevant upsell rejected, retargeting ELIGIBLE/NOT_ELIGIBLE/NEEDS_REVIEW, frequency cap |

Full brief-requirement-to-test mapping matches Section 43 of the brief
category-by-category (IDENTITY, CONSENT/SUPPRESSION, PRODUCT EVENTS,
JOURNEYS, ATTRIBUTION, NEXT-BEST-ACTION, RBAC, RETARGETING) — every listed
category has at least one directly corresponding test above.

## 2. Bugs Found and Fixed During This Build

Disclosed here rather than omitted, per the instruction to report
honestly (same discipline Phase 3 applied to its adapter statefulness
bug).

1. **Lifecycle miscount**: `KSNUMBER_CREATED` was initially included in
   the FIRST_USE-conversion-type set in both
   `src/lib/commercial-memory/lifecycle.ts` and
   `src/lib/attribution/funnel.ts`, which caused a profile to skip
   straight to `FIRST_USE` on KSNumber creation instead of stopping at
   `REGISTERED` — contradicting the locked lifecycle definition
   (`docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md` Section 3: registering
   is not yet using). Caught by
   `tests/phase4-product-events.test.ts`, which asserted the correct
   `REGISTERED` outcome and failed against the buggy code. Fixed by
   excluding `KSNUMBER_CREATED` from both lists.
2. **Stale RESUME_JOURNEY recommendation**: `computeNextBestAction()`
   picked the most-recently-active `ABANDONED` journey without checking
   whether that journey's *type* had since been completed by a separate
   journey instance (the realistic case: the profile abandoned a
   SecureLink draft, came back later, and completed a *new* SecureLink
   journey instance — the original abandoned row's status never changes).
   This meant `RESUME_JOURNEY` could persist forever even after the
   underlying task was actually finished. Caught live during the demo
   scenario walkthrough (`scripts/seed.ts`'s own self-check logged a
   mismatch), not by an automated test alone. Fixed by excluding
   abandoned journeys whose `journeyType` has since been completed by any
   instance, and added `tests/phase4-nba.test.ts`'s abandoned-journey test
   plus re-verified the demo end to end after the fix.
3. **Enum/table SQL name collision**: `retargetingEligibilityEnum` was
   initially named `retargeting_eligibility` — identical to the
   `retargeting_eligibility` table, which collides with Postgres's
   implicit per-table composite type of the same name
   (`type "retargeting_eligibility" already exists`). Caught immediately
   by `npm run db:migrate` failing; the migration transaction rolled back
   cleanly (no partial schema left behind). Fixed by renaming the enum's
   SQL identifier to `retargeting_eligibility_status`.
4. **Demo profile had no eligible channel**: the seeded demo profile never
   had `eligibleChannels` populated, so the Next-Best-Action guard
   (correctly) downgraded every recommendation to `NO_ACTION` — including
   after simulated abandonment, where `RESUME_JOURNEY` was expected. This
   is not a bug in the engine (the guard is working as designed — no known
   channel, no outreach-shaped action), but the demo script was missing a
   realistic step. Fixed by setting the lead's one known channel
   (`GOOGLE_SEARCH`) on profile creation in `scripts/seed.ts`.

## 3. Manual / Live HTTP Validation

No browser-automation tool is installed (same as Phase 1-3). Full manual
walkthrough performed live via `curl` against a running `npm run dev`
server, logged in as each seeded role:

- **Owner flow**: login → `GET /api/profiles` (sanitized list) →
  `GET /api/profiles/:id` (full detail incl. journeys/touchpoints/
  conversions/NBA/retargeting) → `GET /api/impact/summary` →
  `GET /api/impact/funnel` → `POST /api/product-events` (real, non-simulated
  ingestion path) with a fresh `KSNUMBER_CREATED` event → verified
  `PROCESSED` outcome, then re-sent the identical payload and verified
  `DUPLICATE` with zero new `product_events`/`touchpoints`/
  `conversion_events` rows in the database.
- **Suppression flow**: `POST /api/profiles/:id/suppression` (apply) →
  verified profile `lifecycleState` became `SUPPRESSED` and
  `nextBestAction.actionType` became `SUPPRESS` → `POST
  /api/profiles/:id/retargeting-eligibility` returned `NOT_ELIGIBLE` →
  `DELETE /api/profiles/:id/suppression` (remove) → verified
  `lifecycleState` returned to its prior value (`ACTIVE`).
- **RBAC denial flow**: `CONTENT_ENGAGEMENT` → 403 on `GET
  /api/profiles`; `ANALYST` → 403 on `GET /api/profiles`, 200 on `GET
  /api/impact/summary`; `DISTRIBUTION_SALES` → 200 on `GET /api/profiles`
  (approved scope), 403 on `POST /api/profiles` (create is Owner-only).
- **Product-event auth boundary**: unauthenticated request with no
  secret and no session → 403 (not 401 — confirmed the
  `SYSTEM_API_PATHS` middleware carve-out reaches the route handler,
  which performs the real check and rejects); authenticated Owner
  session with an invalid body → 400 `REJECTED` with field-level Zod
  errors.
- **Page rendering**: `/audiences`, `/audiences?tab=profiles`,
  `?tab=organizations`, `?tab=journeys`, `?tab=suppression`,
  `?tab=attribution`, `/audiences/profiles/:id`, and `/impact` all
  returned HTTP 200 as Owner with zero server-side errors in the dev log.
- **Demo scenario**: `npm run db:seed` run twice consecutively — second
  run correctly no-ops (idempotent), confirmed via unchanged row counts
  (`audience_profiles`: 1, `touchpoints`: 7, `next_best_actions`: 6 for
  the demo profile) and no duplicate log output.

## 4. Lint / Typecheck / Build

- `npm run lint` — 0 errors.
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds; 47 static/dynamic routes generated
  (21 unchanged Phase 0-3 pages + 4 new Phase 4 pages/tabs, plus 26 new
  Phase 4 API routes alongside the 37 unchanged Phase 0-3 API routes).

## 5. Secret Scan / Diff Hygiene

- `git diff --check` — clean (no trailing-whitespace/conflict-marker
  issues).
- Grepped the full diff for API-key/secret/password-shaped literals —
  none found. The one new environment variable
  (`PRODUCT_EVENT_INGESTION_SECRET`) is documented empty in `.env.example`,
  never given a value in committed code, and is entirely optional (see
  `docs/PHASE_4_PRODUCT_EVENT_INTEGRATION.md` Section 4).

## 6. Non-Goal Verification

Grepped the full `src/` tree for Growth Director autonomous-reasoning
language, autonomous send/budget-optimization code, and
HubSpot/Clay/n8n/Twilio/SendGrid/Nodemailer integrations — zero matches
outside of comments explicitly stating those are *not* built in this
phase (e.g. the unmodified Growth Director placeholder page, and the new
Impact page's own comment noting Growth Director reasoning remains Phase
5). No live outreach-send adapter of any kind exists in `src/lib`.

## 7. What Was Not Independently Re-Verified

- No load/performance testing was run — same scope boundary as Phase 1-3.
- No CI is configured on this repository (confirmed via absence of
  `.github/workflows/`), consistent with Phase 0-3 — not applicable here
  either.
