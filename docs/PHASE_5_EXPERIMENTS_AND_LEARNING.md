# Phase 5: Experiments & Commercial Learning

Status: Phase 5 — implemented
Last updated: 2026-08-11

## 1. Purpose

Turn A/B messaging/creative decisions from guesswork into evidence, and
store the resulting lessons durably so the engine never repeatedly
relearns the same commercial lesson (brief Sections 10-13).

## 2. Experiment Domain

`experiments` + `experiment_variants` + `experiment_results`
(`src/lib/experiments/{experiments,evaluation}.ts`).

Each **variant** links to the real Phase 3 distribution plan that served
it (`experimentVariants.distributionPlanId`) — this is the entire
attribution mechanism: no parallel variant-assignment/tracking-pixel
system was built. Evaluation reads real touchpoint/conversion history
through that link:

- `sampleCount` = distinct profiles with a touchpoint on the variant's
  plan.
- `primaryMetricCount` = conversions of the experiment's
  `primaryMetricType` among exactly those profiles, within
  `[experiment.startDate, experiment.endDate ?? now]`.

Statuses: `DRAFT` → `PLANNED` → `RUNNING` → `COMPLETED` / `INCONCLUSIVE` /
`CANCELLED`. `planExperiment()` requires ≥2 variants with exactly one
marked `isControl`; `startExperiment()` requires ≥2 variants and stamps
`startDate`.

## 3. The "Not Clicks Alone" Principle (Section 11)

`experiments.primaryMetricType` is a real `conversionTypeEnum` value
(e.g. `FIRST_SECURELINK`), not free text. `computeEvaluation()` **throws**
`ExperimentEvaluationError` if `primaryMetricType` is unset — an operator
cannot evaluate an experiment against impressions/clicks alone; the
system forces a real SecurePay-behavior metric before any result can be
computed. `experiments.primaryMetric` still carries a human-readable
label for display, but it's the structured `primaryMetricType` that
evaluation actually uses.

## 4. Evaluation Engine

`src/lib/experiments/evaluation.ts`. Deliberately **not** an advanced
statistical platform (Section 12) — a simple, documented, fixed formula
stands in for a real significance test:

- **Sample floor**: every variant needs ≥20 reached profiles
  (`MIN_SAMPLE_PER_VARIANT`) before any result is computed — below that,
  confidence is `INSUFFICIENT_DATA` and there is no winner.
- **Confidence banding**: relative lift ≥20% with every variant at ≥50
  samples (`HIGH_CONFIDENCE_MIN_SAMPLE`) → `HIGH`; ≥10% relative lift →
  `MEDIUM`; below that → `LOW`, no winner declared.
- **Winner**: the highest-converting non-control variant, only when
  confidence is `MEDIUM` or `HIGH` and it actually beats control.

Every evaluation call inserts a fresh, append-only `experiment_results`
row (never overwrites) with the full per-variant breakdown (sample count,
conversion count, conversion rate, absolute/relative difference vs
control) — reproducible from the same underlying touchpoint/conversion
data at any time. The experiment's own `status`/`result`/
`interpretation`/`confidence`/`winnerVariantId` are updated to mirror the
latest result.

## 5. AI Summary (Never Rewrites Numbers)

`src/lib/ai/tasks/summarize-experiment.ts` — optional, activates via
`useAiNarrative`. Reuses the `IMPACT_ANALYSIS` task type (already
activated in Phase 4). It receives only the deterministic interpretation
text and hypothesis, and can only add one short plain-language sentence
appended to `interpretation` — it never sees the raw per-variant numbers
and cannot state a different winner or confidence level (Section 12: "AI
may summarize experiment findings but cannot rewrite underlying
numbers").

## 6. Commercial Learning

`commercial_learnings` (`src/lib/learning/learnings.ts`).
`createLearningFromExperiment()` derives `observation`/`conclusion`/
`evidence`/`confidence` directly from the experiment's latest
`experiment_results` row — never a fabricated conclusion, and refuses
(throws) if the experiment hasn't been evaluated yet. Status lifecycle:
`ACTIVE` → `NEEDS_REVIEW` (via `sweepLearningsNeedingReview()`, an
on-demand sweep for learnings past their `reviewAfter` date — no
scheduler, see the main Phase 5 doc Section 11) → `SUPERSEDED` /
`REJECTED`. `supersedeLearning()` links the old learning to its
replacement (`supersededByLearningId`) without deleting history.

## 7. UI

`NewExperimentForm`/`NewVariantForm` (client components) on the campaign
detail page (`/campaigns/[id]`) and a dedicated experiment detail page
(`/campaigns/experiments/[id]`) showing hypothesis, variants, lifecycle
action buttons (Plan/Start/Evaluate/Cancel/Create learning), and full
evaluation history with per-variant metrics. `/impact?tab=experiments`
lists every experiment with status/confidence/result.

## 8. Testing

`tests/phase5-experiments.test.ts` — lifecycle transitions and their
guards (≥2 variants, exactly one control), the `primaryMetricType`
requirement, `INSUFFICIENT_DATA` under a small sample, a real winner
declared with reproducible per-variant metrics under a clear, well-sampled
lift, and learning creation from a real completed experiment (plus the
refusal to create one from an unevaluated experiment).
