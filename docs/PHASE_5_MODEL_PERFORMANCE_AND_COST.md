# Phase 5: Model Performance, Recommendations, Benchmark & AI Cost Control

Status: Phase 5 — implemented
Last updated: 2026-08-11

## 1. Purpose

Answer "Are we using the right model for this task, and why?" (Section
22) and complete AI cost governance (Section 28) — both explicitly
deferred from Phase 1's Model Control Plane design
(`docs/MODEL_CONTROL_PLANE.md` Section 7).

## 2. A Required Schema Addition: `schemaValid`

Before this phase, `ai_usage_records.success` only reflected whether the
AI Gateway call itself reached `EXECUTED` — a call whose raw output later
failed JSON/schema validation (`MALFORMED_OUTPUT`, decided in
`run-structured-task.ts`, one layer above the Gateway) was still recorded
as `success: true`, with no persisted signal of the validation outcome.
Since the brief explicitly asks for a "schema-valid rate" model
performance metric, a genuinely necessary schema addition was made: a
nullable `schemaValid` boolean column on the *existing* `ai_usage_records`
table, set by `run-structured-task.ts` immediately after it knows whether
parsing/validation succeeded. Null means "not a structured-output call"
or "never reached `EXECUTED`" — distinct from `false` ("executed but
failed schema validation"). One column, not a new table — minimal.

## 3. Model Performance

`src/lib/model-evaluation/performance.ts::computeModelPerformanceFor()` —
aggregates real `ai_usage_records` for a `(provider, model, taskType)`
combination over a rolling window (default 30 days):

- `successRate`, `schemaValidRate` (from the column above; `null` if no
  structured-output calls occurred in the window), `avgLatencyMs`,
  `avgCostUsd` — all computed directly from stored records.
- `humanAcceptanceRate`/`revisionRate` are **honestly `null`** — no such
  signal is captured anywhere in this codebase (segments/campaigns/
  distribution plans are approved via `reviewX()` calls that approve the
  *record*, not specifically "the AI's proposal was accepted as-is"). A
  fabricated proxy would violate this codebase's "never fabricate"
  discipline; documented as a known limitation rather than invented.
- `fallbackRate` reuses the live deterministic router
  (`src/lib/ai/router.ts::routeTask`) as a "currently preferred model"
  reference point: for the model that IS currently preferred, it's the
  share of that task type's total volume that went to a *different*
  model during the window; for a non-preferred model, it's trivially 1.0.
  Documented as a stable-reference-point simplification, not a
  point-in-time-accurate replay of every historical routing decision.
- `confidence` is `INSUFFICIENT_DATA`/`LOW`/`MEDIUM`/`HIGH` based on
  sample count, never a fabricated score.

`refreshModelPerformance()` (Owner-only, on-demand) persists a fresh,
append-only snapshot for every `(provider, model, taskType)` combination
with real usage in the window.

## 4. Model Recommendations

`src/lib/model-evaluation/recommendations.ts::generateModelRecommendations()`
— compares the currently-routed ("from") model against every alternative
with ≥10 samples for the same task type, using a simple, documented
weighted formula (success rate 0.4, schema-valid rate 0.2, normalized
cost -0.2, normalized latency -0.2 — **not price alone**, per Section 22).
Proposes a swap only when the alternative's combined score beats the
current model's by ≥5%. The `reason` text cites concrete percentage
deltas (success/cost/latency) and sample sizes — never a vague claim.

Statuses: `PROPOSED` → `APPROVED`/`REJECTED` → `APPLIED`/(stays rejected).
**`applyModelRecommendation()` is the only code path that changes routing
policy** — it requires the recommendation to already be `APPROVED`
(Owner-only both to approve and to apply), and only ever *adds* the task
type to the target model's `approvedTaskTypes` (it does not remove the
task type from the "from" model — the router already prefers the
higher-scoring candidate, so removing the old one is a separate, more
consequential decision left to Admin → AI Models). Every apply is audited
as `ROUTING_POLICY_CHANGED`. No hourly/automatic re-routing exists
anywhere (Section 25).

## 5. Benchmark Suite

`src/lib/model-evaluation/benchmark.ts::runBenchmarkSuite()`. Nine fixed
fixtures covering the exact task-type list from Section 26 (opportunity
classification, source synthesis, Brand Guardian narrative, campaign
strategy, content copy, creative ideation, audience classification,
impact analysis, Growth Director recommendation) plus a generic
structured-JSON-reliability check built into every fixture via a
permissive-but-non-empty-object schema.

**Deliberately not a multi-model bake-off.** Every fixture call goes
through the normal `AIGateway.execute() → routeTask()` path — ADR-002
("application code never selects a provider/model directly") applies to
benchmark code too, so this suite exercises whatever the router currently
selects for each task type, not a forced side-by-side comparison (that
comparison is what Section 4 above already does, from organic usage
history). Manually initiated only (Owner, `POST /api/admin/benchmark`);
respects Safe Mode and AI budget caps automatically (both enforced inside
`AIGateway.execute()`); never calls a distribution provider or publishes
anything; requires no OpenAI/Gemini credentials (mock and/or Anthropic
only, whichever is actually `AVAILABLE`). Each fixture result is persisted
as an `isBenchmark: true` `model_performance` row (`sampleCount: 1`,
`confidence: LOW` — honestly reflecting that one fixture run is a smoke
test, not a statistically meaningful sample), queryable alongside organic
aggregates.

## 6. AI Cost Control

`src/lib/ai/budget.ts`, enforced inside `src/lib/ai/gateway.ts::execute()`
— the single AI Gateway choke point, never in individual task callers.

`ai_budget_policies` supports `GLOBAL`/`PROVIDER`/`MODEL`/`TASK_TYPE`/
`USER` scope, `DAILY`/`MONTHLY` period, independent soft and hard limits.
**Circuit-breaker semantics**: `checkBudget()` sums real spend
(`estimatedCostUsd`) already recorded in the current period and blocks a
*new* call once that cumulative spend already meets/exceeds the hard
cap — it does not (and cannot) predict the new call's own cost in
advance. A blocked call returns a new `AIExecutionResult` outcome,
`BUDGET_EXCEEDED`, records a `success: false` usage row with a clear
reason, and audits `AI_BUDGET_EXCEEDED` — never a silent failure, never a
fabricated success. Soft-limit breaches are surfaced as non-blocking
warnings (`checkBudget().softWarnings`), visible in Admin → Cost & Models.

Setting a policy supersedes any prior active policy for the same
`(scope, scopeRef, periodType)` — the same append-with-supersede
discipline `budget_approvals` established in Phase 3 — and is audited as
`AI_BUDGET_CHANGED`.

**Never blocks deterministic code.** The budget guard lives exclusively
inside `AIGateway.execute()`; every other service (touchpoints, campaigns,
distribution, retention, etc.) is completely unaffected by any AI budget
state, verified in `tests/phase5-ai-budget.test.ts`.

## 7. UI

Admin → **Cost & Models** (`/admin/cost-models`) — one page, four
sections: model performance table (with a Refresh button), model
recommendations list (Approve/Reject/Apply, with a confirmation prompt
before applying a live routing change), a benchmark-run trigger, and
active AI budget policies with a minimal set-policy form
(`SetBudgetPolicyForm`).

## 8. Testing

`tests/phase5-model-evaluation.test.ts` (performance aggregation
correctness, insufficient-sample handling, honest-null
humanAcceptanceRate, explainable recommendations, apply-before-approval
rejected, apply-after-approval changes routing and is audited) and
`tests/phase5-ai-budget.test.ts` (soft warns, hard blocks, policy
supersession, audit, Gateway-level enforcement, deterministic services
unaffected).
