# Phase 5: Impact + Growth Director + Scale

Status: Phase 5 — implemented (final planned phase)
Last updated: 2026-08-11

## 1. Purpose

Phase 5 closes the commercial learning loop:

```
MEASURE → LEARN → RECOMMEND → PRIORITIZE → ACT WITH APPROVAL → MEASURE AGAIN
```

answering, with evidence, "What should SecurePay do next, and why?" This is
the **final planned build phase** of the six-phase roadmap — see
`docs/ROADMAP.md`. No Phase 6 is added; future work is tracked as
post-roadmap enhancements (Section 12 below).

## 2. Repository Inspection Before Implementation

Read before writing any code: `README.md`, `docs/ROADMAP.md`,
`docs/OUTREACH_ENGINE_DOCTRINE.md`, `docs/SECUREPAY_POSITIONING_RULES.md`,
`docs/AI_GOVERNANCE.md`, `docs/ACCESS_CONTROL_MODEL.md`,
`docs/DATA_CLASSIFICATION.md`, `docs/AUDIT_AND_CONTROL.md`,
`docs/MODEL_CONTROL_PLANE.md`, `docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md`,
`docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md`,
`docs/PHASE_4_COMPLETION_REPORT.md`, all 8 ADRs, and the full existing
implementation (AI Gateway/router/registry, `src/lib/rbac/*`,
`src/lib/commercial-memory/*`, `src/lib/product-events/*`,
`src/lib/journeys/*`, `src/lib/attribution/*`, `scripts/seed.ts`). **No
contradiction between the Phase 5 brief and locked doctrine was found.**
Several reading decisions, following the exact precedent Phase 3/4 set —
see Section 3.

## 3. RBAC Reading Decision (Not a Doctrine Change)

No new resource category, no new grant. Applying the existing
`docs/ACCESS_CONTROL_MODEL.md` Section 4 grant table literally:

- **`campaigns`** gates experiments and commercial learnings — the same
  capability Growth Director already holds `view`+`approve` (not
  `create`) on, and Strategist holds `create`+`edit` on. This matches
  Section 41's own framing exactly ("Strategist: approved
  intelligence/campaign/**experiment** work").
- **`analytics`** gates Growth Director recommendation
  viewing/generation. `create` on `analytics` is OWNER-only under the
  literal table — and critically, **Growth Director the role never holds
  `create` on any resource anywhere in existing doctrine** (it only ever
  holds `view`, plus `approve` on `campaigns`). So recommendation
  *generation* is Owner-only, while recommendation *approval* (for
  LOW/MEDIUM risk) is available to both OWNER and GROWTH_DIRECTOR via the
  `approve` capability on `campaigns` it already holds — the same
  "supervisory but not executive" asymmetry Phase 3 established for
  Growth Director on `distribution` (view-only, no approve).
- **`model-config`** gates model performance, model recommendations,
  benchmark runs, and AI budget policies. OWNER has full; GROWTH_DIRECTOR
  has `view` only, never `approve`/`create` — so Growth Director can see
  model/cost data but can never change routing or spend limits, matching
  Section 25 ("OWNER controls approval") precisely with zero new grants.
- **`audience`** gates retention review/anonymization — the same
  OWNER-only mutation precedent Phase 4 established for
  suppression/consent.

This resolves every RBAC requirement in Section 41 without a gap.

## 4. Impact Engine

`src/lib/impact/{scorecards,roi}.ts`, extending Phase 4's
`src/lib/attribution/funnel.ts`. Every scorecard/efficiency figure is a
direct aggregation of real Phase 1-4 records:

- **Campaign scorecard** (`computeCampaignScorecard`): reach, engagement,
  registrations, first use, agreement completion, repeat use, attributed
  conversions (LINEAR-model), spend (from `distribution_executions`),
  cost per conversion, funnel + drop-off findings (reused from Phase 4).
- **Channel scorecard** (`computeChannelScorecard`): reach, meaningful
  conversions, spend, conversion rate, first/last/linear/multi-touch
  contribution counts.
- **Product scorecards** (`computeProductScorecards`): adoption count per
  product touchpoint type (SecureLink/KeyContract/Group SecureLink/
  SecureFlow). Repeat-use is reported once as an overall figure, not
  fabricated per-product, since `REPEAT_USE`/`PRODUCT_REUSED` are
  product-agnostic signals in this schema — a documented limitation, not
  an invented split.
- **Audience scorecard** (`computeAudienceScorecard`): engagement,
  conversions, and lifecycle distribution for the profiles a given
  audience segment's linked distribution plans actually reached.

## 5. ROI / Efficiency

`src/lib/impact/roi.ts::computeEfficiencySummary()` sums real
`distribution_executions.reportedSpend` and real
`ai_usage_records.estimatedCostUsd`, then divides by real outcome counts
(engaged profiles, KSNumbers, first product uses, completed agreements,
repeat users) — every cost-per-outcome is `null`, not a fabricated
`0`/`Infinity`, when the outcome count is zero.
`computeRoi()` only ever computes a real ROI when at least one
`conversion_events.value` is non-null; otherwise it returns
`{ status: "INSUFFICIENT_VALUE_DATA" }` — never fabricated, per Section 9.
A zero measured cost also returns `INSUFFICIENT_VALUE_DATA` (division by
zero is mathematically undefined, not silently reported as infinite ROI)
— documented as a known simplification (it's technically a missing-cost
case, not a missing-value case, but keeps the contract to one status
pair).

## 6. Experiment Domain & Commercial Learning

See `docs/PHASE_5_EXPERIMENTS_AND_LEARNING.md`.

## 7. Growth Director Architecture

`src/lib/growth-director/{candidates,ranking,engine,approval}.ts` — the
hybrid deterministic + AI architecture Section 20 requires.

**Deterministic layer** (`candidates.ts`) — eight independent rules, each
reading real Phase 1-4/5 data and producing zero or more
`RecommendationCandidate` objects with concrete evidence:

1. **Funnel drop-off** → `REVISE_POSITIONING` (early-funnel reach→visit
   drop) / `IMPROVE_ONBOARDING` (activation drop) / `SHIFT_CHANNEL_PRIORITY`
   — reuses Phase 4's `computeDropOffFindings`. Mirrors Section 18 example
   #2.
2. **Low-value plan** → `PAUSE_LOW_VALUE_PLAN` for a RUNNING plan with
   real measured spend, real reach ≥10, and zero attributed conversions.
   Mirrors Section 18 example #3.
3. **Winning experiment variant** → `INCREASE_BUDGET_REQUEST` for a
   COMPLETED experiment with a winner at MEDIUM+ confidence. Mirrors
   Section 18 example #1.
4. **Abandoned-journey backlog** → `RECOVER_JOURNEY`, reusing Phase 4's
   own `ABANDONED` journey state (never re-derived).
5. **Upsell/re-engagement cohorts** → `UPSELL_SEGMENT`/`REENGAGE_SEGMENT`,
   reusing Phase 4's own current `next_best_actions`/lifecycle
   classifications (never re-guessed).
6. **High-scoring unreviewed opportunity** → `INVESTIGATE_OPPORTUNITY`.
7. **Untested multi-variant campaign** → `RUN_EXPERIMENT`.
8. **Proposed model recommendation** → `REVIEW_MODEL`, surfacing
   `src/lib/model-evaluation/recommendations.ts` output for cross-pillar
   visibility (never regenerated/re-decided here).

If every rule returns nothing, a single `NO_ACTION` candidate is emitted
— `NO_ACTION` is a first-class, always-representable output (Section 16),
never an empty/missing state.

**Ranking layer** (`ranking.ts`) — a fixed weighted-sum formula over six
dimensions each rule already assigned from its own evidence (impact 0.35,
confidence 0.20, evidence-strength 0.15, effort -0.10, risk -0.15, cost
-0.05). Deterministic and reproducible: identical input always produces
an identical score, with every dimension's raw value, weight, and
contribution stored in `rankingExplanation` for full explainability
(Section 40). No opaque ML ranking anywhere.

**AI layer** (`src/lib/ai/tasks/synthesize-growth-recommendations.ts`,
activating the declared-but-unused `GROWTH_RECOMMENDATION` task type from
Phase 1) — may only attach one short narrative sentence per recommendation,
addressed strictly by the exact `id` the caller supplied. The caller
(`engine.ts::generateAndPersistRecommendations`) re-validates every
returned id against the known set before writing anything — an AI-invented
id is silently dropped, never trusted. AI can never add, remove, re-rank,
or re-score a candidate.

## 8. "What Should SecurePay Do Next?"

`src/lib/growth-director/engine.ts::whatShouldSecurePayDoNext()` — the
first-class query (Section 19). Returns the current top 3-7 recommendations
(fewer only if fewer real ones exist — never padded with invented advice),
each with recommendation/why/evidence/expected-outcome/cost/risk/
confidence/pillars/suggested-owner/approval-requirement/next-step. Backed
by `/growth-director`'s UI and `GET /api/growth-director/what-next`.

## 9. Human Approval & Action Bridge

`src/lib/growth-director/approval.ts`. Approval is risk-tiered
(Section 36): HIGH-risk recommendations (budget/paid-media/bulk-outreach/
pricing/compliance/high-impact-routing) require OWNER, enforced as a
service-layer rule on top of the API route's `approve`-on-`campaigns`
capability check (which alone would let GROWTH_DIRECTOR through) — the
same "capability necessary but not sufficient" layering Phase 3 used for
distribution budget approval. LOW/MEDIUM-risk recommendations can be
approved by OWNER or GROWTH_DIRECTOR. Rejection has no risk-tier gate
(rejecting is always the safe direction).

The **action bridge** (Section 37) only ever prepares real, safe downstream
work — never launches paid media or sends bulk outreach:

- `PAUSE_LOW_VALUE_PLAN` → calls the real Phase 3
  `DistributionGateway.pause()` (the safe direction).
- `RUN_EXPERIMENT` → creates a real experiment draft
  (`createExperiment`, status `DRAFT`).
- `INCREASE_BUDGET_REQUEST`/`REDUCE_BUDGET_REQUEST` → **always
  `BLOCKED`**, with an explicit message that budget changes are never
  automated — the action bridge deliberately refuses to touch spend.
- Every other action type → marked `ACTIONED` with no automated artifact
  (the human completes the follow-through outside the system) rather than
  silently failing.

A `BLOCKED`/`NO_DOWNSTREAM_ACTION` outcome never advances the
recommendation's status past `APPROVED` — only a genuine `ACTIONED`
outcome does, so the audit trail never claims something happened that
didn't.

## 10. Suppression / Safe Mode Never Overridden

Growth Director candidates are built entirely from Phase 4's own
suppression-aware lifecycle and next-best-action state — a suppressed
profile's current NBA is always `SUPPRESS` (Phase 4), which structurally
can never contribute to an `UPSELL_SEGMENT`/`REENGAGE_SEGMENT` candidate.
Recommendation *generation* is a LOW-risk analysis action and remains
available during Safe Mode (matching Section 42's "planning/memory may
continue in Safe Mode"); the action bridge's own downstream calls (e.g.
`DistributionGateway.pause()`) still go through their own unmodified
Safe-Mode/budget/consent checks.

## 11. Automation Boundary

Per Section 31's explicit escape hatch ("If a scheduler would create
significant infrastructure complexity: document the interface and keep
execution manual/on-demand"), Phase 5 does **not** introduce a scheduler,
queue, or background worker. Every refresh/sweep function
(`generateAndPersistRecommendations`, `refreshModelPerformance`,
`expireStaleRecommendations`, `sweepLearningsNeedingReview`, Phase 4's
`sweepAbandonedJourneys`/`sweepDormantProfiles`) is a plain, safely
re-runnable, on-demand function callable from the UI or a future cron —
the interface is documented here, execution is manual, matching the exact
precedent Phase 4 set for `sweepAbandonedJourneys`.

## 12. POST-ROADMAP ENHANCEMENTS

Per Section 50 — **not Phase 6**, just possible future work outside the
locked six-phase roadmap:

- Live Google Ads / Meta Ads / TikTok / LinkedIn adapters
- Live WhatsApp/email sending
- Partner distribution API
- Additional AI providers (OpenAI, Gemini going live)
- Advanced Analytics API authentication (API keys/OAuth for external
  clients, beyond the internal session-authenticated boundary Phase 5
  ships)
- CRM connectors
- n8n/automation connectors
- Scheduled/cron-driven automation (formalizing Section 11's manual
  interfaces)
- Production deployment hardening
- Automated data-retention sweeps (formalizing the manual review flow
  Phase 5 ships)
- Additional/expanded benchmarks, true side-by-side multi-model
  comparison

## 13. Non-Goals (confirmed not built)

Matches the brief's Section 51 list exactly: no unrestricted autonomous ad
spending, no autonomous bulk outreach, no autonomous pricing changes, no
uncontrolled self-modifying agents, no automatic provider/model switching
without an explicit Owner-approved policy change, no multi-agent debates,
no CRM replacement, no data warehouse, no blockchain audit, no community
features, no exhaustive external-integration sweep, no SecurePay API
replacement, and **no Phase 6**. Confirmed by direct code review and grep
— see `docs/PHASE_5_TEST_AND_VALIDATION_REPORT.md`.
