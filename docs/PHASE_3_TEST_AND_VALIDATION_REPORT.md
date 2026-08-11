# Phase 3 Test & Validation Report

Status: Phase 3 — Targeting + Distribution
Last updated: 2026-08-11

## 1. Automated Test Suite

`npm test` (vitest, `fileParallelism: false`, 30s timeout — unchanged
config from Phase 2): **152 tests passing, 7 skipped, across 13 passing
test files** (2 pre-existing E2E files conditionally skip when a spawned
`next dev` server isn't reachable — unchanged from Phase 1/2, not a Phase 3
regression).

New Phase 3 files (49 new tests):

| File | Tests | Covers |
|---|---|---|
| `tests/phase3-scoring.test.ts` | 18 | Targeting-score math (unweighted average, optional `channelFit`, clamping, explanations); sensitive-targeting guard (all 5 prohibited categories rejected, clean commercial text passes, AI-tainted input rejected identically to human input); channel-recommendation engine (every channel scored exactly once, deterministic, Google Search boosted by intent language, LinkedIn boosted by B2B criteria, only-above-threshold + priority-ordered output). |
| `tests/phase3-rbac.test.ts` | 8 | `audience`/`distribution` resource grants for all 6 roles — Owner-only create/edit/approve on audience; Owner-only approve on distribution (explicit contrast with Growth Director's campaign-approve grant); Distribution/Sales create/edit; Content & Engagement and Analyst fully denied. |
| `tests/phase3-adapter.test.ts` | 12 | Simulated adapter (prefixed id, deterministic status/spend, pause, statelessness across a fresh call with no prior launch, deterministic failure marker, no credentials needed); provider readiness (Google/Meta never `AVAILABLE`); router (`PLAN_ONLY` never routes, `SIMULATED` always routes to `simulated`, `LIVE` never falls back to simulated). |
| `tests/phase3-db.test.ts` | 11 | Full integration against real Postgres: sensitive-targeting rejection at the service layer; plan creation requires an `APPROVED` audience; Brand Guardian gate blocks `BLOCK`/PASS-but-no-budget from `READY`; budget guard (no launch without approval, total-cap enforcement, negative-budget rejection, re-approval required after a post-approval budget change); execution preconditions (`PLAN_NOT_READY`, audited `EXECUTION_STARTED`, real `sim_` external id); Safe Mode blocks launch but not planning/editing. |

Full existing suite (109 Phase 0-2 tests, unchanged) remains green —
confirmed by the same `npm test` run, not a separate pass.

## 2. Brief-Requirement → Test Mapping

- **Scoring math** → `phase3-scoring.test.ts` "audience targeting score" block.
- **Explanations** → same file, "every required dimension has an explanation."
- **Prohibited sensitive targeting rejected** → same file, "sensitive-targeting guard" block (6 tests, one per category plus a clean-text control plus an AI-output-shaped case) and `phase3-db.test.ts`'s service-layer rejection test.
- **Malformed AI audience output rejected** → covered transitively via the shared `runStructuredTask` (already tested in `tests/phase2-db.test.ts`, unchanged and reused unmodified by `analyze-audience.ts`); `phase3-db.test.ts` additionally proves a well-formed AI-shaped submission with a prohibited trait is still rejected by the deterministic guard, not just schema validation.
- **RBAC: Content & Engagement cannot launch/edit distribution** → `phase3-rbac.test.ts` + live HTTP check (Section 4).
- **RBAC: Distribution/Sales doctrine-permitted actions only** → `phase3-rbac.test.ts` + live HTTP check (Section 4).
- **RBAC: Analyst cannot mutate** → `phase3-rbac.test.ts` ("no view grant" — Analyst has zero distribution access under the literal grant table, stricter than "read-only") + live HTTP check.
- **RBAC: Owner approval works** → `phase3-db.test.ts` full lifecycle tests.
- **Brand Gate: BLOCK/REVISE cannot become executable** → `phase3-db.test.ts` "Brand Guardian gate" block.
- **Brand Gate: PASS may proceed** → same block, second test (reaches `APPROVED`).
- **Budget: no launch without approved budget / no launch above cap / re-approval after change / negative impossible** → `phase3-db.test.ts` "budget guard" block, 4 tests.
- **Safe Mode: blocks execution / planning remains allowed** → `phase3-db.test.ts` + live HTTP walkthrough (Section 4).
- **Adapter: simulated launch/pause work, IDs marked simulated, no real provider called** → `phase3-adapter.test.ts` + grep verification (Section 5).
- **Provider status: Google/Meta don't falsely show AVAILABLE** → `phase3-adapter.test.ts` "provider readiness" block.
- **Execution: plan must be APPROVED/READY, execution audited, status transitions validated** → `phase3-db.test.ts` "execution" block.

## 3. Manual / Live HTTP E2E Walkthrough

No browser-automation tool is installed (same as Phase 1/2). Performed
live via `curl` against a running `npm run dev` server, using seeded dev
accounts, after `npm run db:migrate && npm run db:seed`:

**Owner flow**: logged in → confirmed `GET /api/audiences` and
`GET /api/distribution/providers` return real, non-fabricated data (the
provider list correctly shows `simulated` = `AVAILABLE`, `google_ads`/
`meta_ads` = `NOT_CONFIGURED`) → built a fresh campaign → audience →
distribution plan through every service function directly (equivalent to
the UI's form submissions) → proposed and approved a budget → ran Brand
Guardian (PASS) → approved the plan → marked it `READY` → launched via
`POST /api/distribution/plans/{id}/launch` (200, real `sim_` execution id
returned) → confirmed the plan/execution rows in the DB.

**RBAC denial flow**: Content & Engagement — `GET /api/distribution/plans`
→ 403; `GET /api/audiences` → 403. Analyst — `GET /api/distribution/plans`
→ 403. Distribution/Sales — `GET /api/distribution/plans` → 200 (has
`view`); `POST /api/distribution/plans/{id}/review` (approve) → 403 (no
`approve` capability, Owner-only) — confirms the RBAC reading decision in
Section 4 of `docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md` is enforced, not
just documented.

**Safe Mode flow**: with a `READY` plan already prepared, enabled Safe Mode
as Owner (`POST /api/admin/safe-mode {"mode":"SAFE_MODE"}`) → attempted
launch → `409 {"outcome":{"outcome":"SAFE_MODE_BLOCKED", ...}}` (never a
500, never a fabricated execution) → confirmed planning still works
(`PATCH` on the same plan → 200, field updated) → disabled Safe Mode →
launch → `200 {"outcome":{"outcome":"LAUNCHED", ...}}` with a real `sim_`
id.

**Pause flow**: `POST /api/distribution/plans/{id}/pause` on the just-launched
plan initially returned **500** — see Section 5. After the fix, re-run
against a freshly restarted dev server, deliberately hitting two unrelated
API routes first to force separate on-demand route compilation, then
launch → pause: both succeeded (200), and the plan/execution rows both
correctly read `PAUSED`.

## 4. RBAC Verification Detail (live, real session cookies)

| Check | Result |
|---|---|
| Content & Engagement `GET /api/distribution/plans` | 403 |
| Content & Engagement `GET /api/audiences` | 403 |
| Analyst `GET /api/distribution/plans` | 403 |
| Distribution/Sales `GET /api/distribution/plans` | 200 |
| Distribution/Sales `POST .../review` (approve) | 403 |

## 5. A Real Bug Found and Fixed During Manual Validation

The unit test suite (`phase3-adapter.test.ts`) passed from the start
because it exercises the adapter within a single Node process. The live
HTTP walkthrough caught something unit tests could not: the first
`simulated.ts` implementation kept launched-execution state in a
module-level in-memory `Map`. Next.js dev mode compiles API routes
on-demand into separately instantiated modules — `launch`'s and `pause`'s
copies of that module (and therefore their `Map`s) were not the same
object, so `pause()` threw `Unknown simulated execution id` and the API
returned 500. The same failure mode would occur, worse, on a real
serverless production deployment where consecutive requests routinely
don't share a process at all.

**Fix**: the adapter was redesigned to be fully stateless — `status()`/
`spendSnapshot()` now take an explicit `context: { approvedBudget }`
argument and derive a deterministic figure purely from
`(externalExecutionId, context)`; `pause()` always succeeds
deterministically; the `distribution_executions` DB row (updated only by
explicit `launch()`/`pause()` calls) remains the sole authoritative
lifecycle state. Full design writeup:
`docs/PHASE_3_PROVIDER_ADAPTERS.md` Section 4. Re-verified live after the
fix (Section 3 above) and the unit test suite was updated to assert
statelessness explicitly (`phase3-adapter.test.ts`, "never depend on
in-process memory from a prior launch call").

This is the kind of defect only live wire-level validation surfaces —
recorded here rather than silently fixed and omitted, per the instruction
to report honestly rather than only claim success.

## 6. Lint / Typecheck / Build

All clean: `npm run lint` (0 errors), `npm run typecheck` (0 errors),
`npm run build` (63 routes — 37 Phase 0-2 unchanged + 26 new Phase 3
routes/pages, succeeds).

## 7. Secret Scan

Clean. `.env.local` confirmed absent from `git ls-files` and from the
staged changeset. Pattern scan for AWS/Anthropic/OpenAI/GitHub token
shapes and PEM headers found nothing in `src/`, `scripts/`, or `docs/`.

## 8. Architecture Grep Verification

- Only `src/lib/distribution/gateway.ts`, `router.ts`, and `providers.ts`
  import `./adapters` — no API route or other service module imports a
  distribution adapter directly (`providers.ts`'s use is a read-only
  configuration check for the readiness display, the same class of use
  `src/lib/ai/registry.ts` makes of the AI adapter registry).
- No `GOOGLE_ADS_*`/`META_ADS_*` environment variable is read anywhere in
  this codebase — grep-verified; only comments mention the names.
- `git diff --check` on the full staged changeset: clean, no whitespace
  errors.

## 9. Database / Migration

Three new migrations (`drizzle/0002_remarkable_betty_brant.sql`,
`0003_shiny_the_hand.sql`, `0004_orange_gauntlet.sql`) applied cleanly via
`npm run db:migrate` against the local Postgres instance
(`docker-compose.yml`, unchanged). No manual schema edits — all changes
came from `drizzle-kit generate` against `src/lib/db/schema.ts`.

## 10. Demo Scenario Verification

`npm run db:seed`, re-run twice for idempotency, correctly: (a) on a
database where the Phase 2 demo campaign had not yet reached
`READY_FOR_DISTRIBUTION`, skipped Phase 3 demo seeding with a clear console
message; (b) once a `READY_FOR_DISTRIBUTION` demo campaign existed (from an
earlier session's live walkthrough), created exactly one `isDemo: true`
`APPROVED` audience segment, one `isDemo: true` `distribution_plans` row
reaching `RUNNING`, and one `distribution_executions` row with a real
`sim_` id and `isSimulated: true` — verified directly against the
database. Second seed run correctly no-op'd (idempotency check by
existing-segment name).

## 11. Non-Goal Confirmation

Grep-verified absent from `src/`: `contact_profiles`, `commercial_memory`,
`journey_events`, `attribution_events`, `retargeting_states`,
`target_organizations`, `next_best_action`, `growth_director` reasoning
code, any HubSpot/Clay/n8n integration, any public unauthenticated
analytics route. `AI_TASK_TYPES` additions are limited to
`CHANNEL_RECOMMENDATION` (narrative enrichment only); no new AI
capability was granted beyond LOW/MEDIUM-risk analysis/recommendation.

## 12. Known Limitations (see completion report Section W for the full list)

- `audience_scores.evidenceStrength` has no per-audience evidence table to
  derive from deterministically (unlike opportunities) — it is AI-proposed/
  human-set like the other five dimensions, documented in
  `docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md` Section 8.
- No audience-segment strategy edit UI form beyond the create form (the
  PATCH API exists and is tested) — same class of deferred-scope decision
  Phase 2 made for campaign strategy editing.
