# Phase 5 Test & Validation Report

Status: Phase 5 — Impact + Growth Director + Scale
Last updated: 2026-08-11

## 1. Automated Test Suite

**266 tests passing, 7 skipped, across 27 passing test files** (`npm
test`) — 53 new Phase 5 tests across 7 files, plus the full Phase 0-4
suite (213 tests) still passing after one deliberate, disclosed update
(Section 2) and one real bug fix (Section 3).

| File | Tests | Covers |
|---|---|---|
| `tests/phase5-rbac.test.ts` | 11 | Literal grant-table application: `campaigns` for experiments/learnings, `analytics` for recommendations (Owner-only create, Growth-Director-only-view-not-create), `model-config` for cost/model controls, `audience` for retention |
| `tests/phase5-impact.test.ts` | 6 | Scorecard metrics match real touchpoints/conversions exactly, zero-activity campaign reports zero (never fabricated), channel slices correct, ROI insufficient-data vs computed states, cost-per-outcome never divides into a fabricated number |
| `tests/phase5-experiments.test.ts` | 6 | Lifecycle transitions + guards, primaryMetricType requirement, insufficient-sample → INCONCLUSIVE, real winner with reproducible per-variant metrics, learning creation (and its refusal pre-evaluation) |
| `tests/phase5-growth-director.test.ts` | 12 | Ranking reproducibility, NO_ACTION validity, evidence traceability, HIGH-risk-requires-Owner approval gate, LOW/MEDIUM approvable by Growth Director, budget-change action types always BLOCKED, suppressed profiles never drive upsell candidates, generation works during Safe Mode |
| `tests/phase5-model-evaluation.test.ts` | 7 | Performance aggregation exactness, insufficient-sample handling, honest-null humanAcceptanceRate, explainable recommendations, apply-before-approval rejected, apply-after-approval changes routing + audited |
| `tests/phase5-ai-budget.test.ts` | 6 | Soft-threshold warning, hard-threshold blocking (circuit breaker), policy supersession, audit trail, Gateway-level enforcement, deterministic services unaffected |
| `tests/phase5-retention.test.ts` | 5 | Only explicit retentionUntil makes a profile eligible, legal hold blocks even past retentionUntil, anonymization clears identifiers while preserving lifecycle aggregates, every action audited |

Full brief-requirement-to-test mapping matches Section 46 of the brief
category-by-category (IMPACT, EXPERIMENTS, GROWTH DIRECTOR, MODEL
SELF-CHECK, AI BUDGET, RBAC, RETENTION) — every listed category has at
least one directly corresponding test above.

## 2. A Pre-Existing Test Deliberately Updated (Not a Regression)

`tests/ai-gateway-phase2.test.ts`'s "never falls back to an unapproved/
unavailable provider" test previously asserted that `GROWTH_RECOMMENDATION`
had no approved model — true in Phase 1-4, but Phase 5 legitimately
activates `GROWTH_RECOMMENDATION` for the mock model (the same pattern
`IMPACT_ANALYSIS` followed in Phase 4), so the assertion's premise
changed. Updated to use `CONTENT_COPY`, which remains genuinely
unactivated (confirmed via direct DB query and the benchmark suite's own
live `NO_AVAILABLE_MODEL` result for that task type — see Section 4).
This preserves the test's actual invariant (no silent fallback to an
unapproved model) rather than weakening it.

## 3. A Real Bug Found and Fixed During This Build

Disclosed here rather than omitted, per the discipline established in
Phase 3/4's own reports. Writing `tests/phase5-retention.test.ts`
surfaced that `src/lib/commercial-memory/identity.ts::resolveProfile()`
(Phase 4) never actually populated `audience_profiles.emailRef`/
`phoneRef` — only `profile_identifiers` (the identifier-evidence table)
was written. The columns existed, were documented, and were correctly
RESTRICTED-redacted by `sanitizeProfileForRole` for every response — but
they were always `null`, so that redaction was protecting an empty
field. Investigated for an active data-exposure risk: `listProfileIdentifiers()`
(the function that reads the *actual* hashed values) is never called
from any API route or page — grep-verified — so no endpoint ever leaked
`profile_identifiers.identifierValue`. The bug was a correctness gap
(RESTRICTED columns never populated), not an active leak. Fixed by
populating `emailRef`/`phoneRef` from the same hashed candidates already
computed for `profile_identifiers`, in both the profile-creation and
profile-update paths, then re-verified: a full local database reset,
re-seed, and re-run of the full Phase 0-5 test suite (266/266 passing)
confirmed the fix and that nothing else depended on the previous
(incorrect) always-null behavior.

## 4. Manual / Live HTTP Validation

No browser-automation tool is installed (same as Phase 1-4). Full manual
walkthrough performed live via `curl` against a running `npm run dev`
server, after a full database reset + fresh Phase 2→3→4→5 demo
walkthrough (Owner logs in, walks the Phase 2 demo signal through
analyze → approve → campaign → Brand Guardian → approve to
`READY_FOR_DISTRIBUTION`, then `npm run db:seed` cascades Phase 3, 4, and
5 demo data automatically):

- **Growth Director**: `GET /api/growth-director/what-next` returned real,
  evidence-backed recommendations — a funnel drop-off finding with the
  exact ratio (`16/60 = 26.7%`), a pause-candidate plan with its real
  reach/spend/zero-conversion evidence, and the winning experiment
  variant with its real per-variant sample counts and relative lift.
- **Risk-tiered approval, live**: `GROWTH_DIRECTOR` approved a
  MEDIUM-risk `INCREASE_BUDGET_REQUEST` (200), was denied actioning it
  (403, Owner-only), and `OWNER` actioning it correctly returned
  `BLOCKED` with the "budget changes are never automated" message — the
  recommendation's status stayed `APPROVED`, not silently `ACTIONED`.
- **RBAC denial/allow matrix**: `CONTENT_ENGAGEMENT`/`ANALYST` 200 on
  `GET /api/growth-director/recommendations` (basic/approved scope);
  both 403 on `POST` (generate, Owner-only); `CONTENT_ENGAGEMENT` 403 on
  `GET /api/admin/model-performance` and `GET /api/profiles`.
- **Model performance/benchmark**: `POST /api/admin/model-performance`
  and `POST /api/admin/benchmark` both ran live against the real mock
  provider, producing real (not fabricated) latency/cost/schema-validity
  figures and persisting `isBenchmark: true` snapshots.
- **AI budget circuit breaker, live**: set a `$0` GLOBAL daily hard cap →
  every subsequent benchmark fixture call returned `BUDGET_EXCEEDED`
  (never a fabricated success) → deterministic endpoints (e.g.
  `GET /api/touchpoints`) remained fully functional (200) throughout →
  7 `AI_BUDGET_EXCEEDED` audit events confirmed written → cap removed,
  AI calls resumed succeeding.
- **Retention, live**: manually backdated one profile's `retentionUntil`
  → it appeared in `GET /api/retention` → `POST .../anonymize` cleared
  `emailRef`/`displayName`, set `retentionClass: "anonymized"`, and
  preserved `lifecycleState` unchanged.
- **Page rendering**: `/growth-director`, `/impact` and all seven tabs
  (`overview`/`campaigns`/`channels`/`products`/`experiments`/`costs`/
  `learnings`), `/admin/cost-models`, `/audiences?tab=retention`, the
  campaign detail page's new Experiments section, and the experiment
  detail page all returned HTTP 200 with zero server-side errors in the
  dev log.
- **Demo scenario**: `npm run db:seed` run twice consecutively from the
  same base state — second run correctly no-ops (experiment count,
  recommendation count, and profile count all unchanged) — and the
  script's own self-checks (expected `RESUME_JOURNEY`, expected
  `FIRST_USE`/`ACTIVE` lifecycle, expected experiment `COMPLETED` with a
  winner, expected `INCREASE_BUDGET_REQUEST` and `PAUSE_LOW_VALUE_PLAN`
  recommendations) all passed with no warnings logged.

## 5. Lint / Typecheck / Build

- `npm run lint` — 0 errors.
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds; new routes: `/growth-director` (rebuilt),
  `/impact` (rebuilt with 7 tabs), `/admin/cost-models`,
  `/campaigns/experiments/[id]`, plus ~25 new API routes
  (`/api/experiments/**`, `/api/learnings/**`,
  `/api/growth-director/**`, `/api/admin/model-performance`,
  `/api/admin/model-recommendations/**`, `/api/admin/benchmark`,
  `/api/admin/ai-budget`, `/api/retention/**`, `/api/analytics/**`,
  `/api/impact/scorecards`, `/api/impact/efficiency`) alongside every
  unchanged Phase 0-4 route.

## 6. Secret Scan / Diff Hygiene

- `git diff --check` — clean (no trailing-whitespace/conflict-marker
  issues) after one cosmetic fix (a stray trailing blank line).
- Grepped the full diff for API-key/secret/password-shaped literals —
  none found. No new environment variables were introduced in Phase 5.

## 7. Non-Goal / No-Phase-6 Verification

Grepped the full `src/`/`docs/` tree for "Phase 6" mentions — the only
match is this codebase's own doc-comment stating "no Phase 6 tables"
(a negation). Grepped for autonomous ad-spend/bulk-outreach/pricing-change
code, automatic model-switching outside the explicit
approve→apply flow, and CRM/data-warehouse/blockchain scaffolding — zero
matches. `actionRecommendation()`'s `INCREASE_BUDGET_REQUEST`/
`REDUCE_BUDGET_REQUEST` branches are the one place budget changes could
plausibly be automated, and they are hard-coded to always return
`BLOCKED` — verified directly in `tests/phase5-growth-director.test.ts`.

## 8. What Was Not Independently Re-Verified

- No load/performance testing was run — same scope boundary as Phase 1-4.
- No CI is configured on this repository (confirmed via absence of
  `.github/workflows/`), consistent with Phase 0-4 — not applicable here
  either.
- True side-by-side multi-model benchmarking was not built (see
  `docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md` Section 5) — this phase's
  benchmark suite exercises the router's live selection, not a forced
  comparison, by architectural necessity (ADR-002).
