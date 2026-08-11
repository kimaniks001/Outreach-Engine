# Phase 3: Targeting + Distribution

Status: Phase 3 — implemented
Last updated: 2026-08-11

## 1. Purpose

Phase 3 turns an approved Phase 2 campaign into a scored audience, a
channel plan, a budget-guarded distribution plan, and a controlled
(simulated-only) execution. It proves the full chain:

```
APPROVED CAMPAIGN → TARGET AUDIENCE → AUDIENCE SCORE → CHANNEL PLAN
→ BUDGET / APPROVAL → CONTROLLED DISTRIBUTION → EXECUTION RECORD
```

No commercial memory, attribution, or conversion funnel is built here —
those remain Phase 4, per `docs/ROADMAP.md`.

## 2. Repository Inspection Before Implementation

Read before writing any code: `README.md`, `docs/ROADMAP.md`,
`docs/OUTREACH_ENGINE_DOCTRINE.md`, `docs/SECUREPAY_POSITIONING_RULES.md`,
`docs/AI_GOVERNANCE.md`, `docs/ACCESS_CONTROL_MODEL.md`,
`docs/DATA_CLASSIFICATION.md`, `docs/AUDIT_AND_CONTROL.md`,
`docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md`, both Phase 2 docs, all 8
ADRs, and the full existing implementation (`src/lib/db/schema.ts`, all of
`src/lib/rbac/*`, `src/lib/safe-mode/state.ts`, `src/lib/ai/*`,
`src/lib/campaigns/campaigns.ts`, `src/lib/brand-guardian/*`,
`scripts/seed.ts`). **No contradiction between this phase's brief and
locked doctrine was found.** Several reading decisions were required,
following the exact precedent Phase 2 set (literal application of the
existing RBAC grant table, documented rather than silently expanded) — see
Section 4.

## 3. Five Pillars / Roadmap

Unchanged. Phase 3 primarily activates DISTRIBUTION. No pillar was renamed
or added; no phase was added to the six-phase roadmap.

## 4. RBAC Reading Decisions (Not Doctrine Changes)

`docs/ACCESS_CONTROL_MODEL.md` Section 4's capability table already defines
grants for the `audience` and `distribution` resource categories (both
existed since Phase 0, unused until now). This build applies them exactly
as written:

**`audience` resource** — OWNER `full` (create/edit/approve); GROWTH_DIRECTOR
`view` only (full scope); STRATEGIST/DISTRIBUTION_SALES `view` only
(`approved` scope); CONTENT_ENGAGEMENT/ANALYST none. So **only OWNER
creates/edits/approves Audience Segments** — the same "Owner captures,
others view within scope" pattern Phase 2 established for intelligence.
STRATEGIST/DISTRIBUTION_SALES only ever see `APPROVED` segments.

**`distribution` resource** — OWNER `full`; GROWTH_DIRECTOR `view` only
(**no `approve`** — its grant is `{view}`, not `{view, approve}` as it has
for `campaigns`); STRATEGIST `view` only (no create); DISTRIBUTION_SALES
`create`/`edit` at `approved` scope; CONTENT_ENGAGEMENT none. So **only
OWNER can approve distribution plans and budgets**. This directly resolves
the brief's own conditional language ("GROWTH_DIRECTOR may approve only
where Phase 0 RBAC explicitly permits campaign/distribution approval") in
the conservative direction — the grant table does not explicitly permit it,
so it stays Owner-only, per the brief's own instruction to "document the
gap and implement the most conservative behavior" when a needed permission
isn't present. DISTRIBUTION_SALES may create/edit plans; the service layer
additionally enforces the "approved scope" the grant table names by
requiring the linked audience segment to already be `APPROVED`
(`src/lib/distribution/plans.ts::createDistributionPlan`).

**No dedicated `budget` resource exists in doctrine.** Budget approval is
treated as the `approve` capability on `distribution` (a budget is a
property of a distribution plan) — OWNER only, consistent with the above.

Pause is deliberately gated one level lower than launch: `edit` on
`distribution` (OWNER + DISTRIBUTION_SALES) rather than `approve`. Stopping
spend is the safe direction, so a plan's own owner can do it without
waiting on Owner approval; starting/increasing spend (launch, budget
approval) always requires `approve`.

## 5. Other Reading Decisions

- **Target Organizations** (brief Section 21): no `target_organizations`
  table. Per the brief's own stated preference ("if this can be handled as
  Audience Segment + public organization references, prefer that simpler
  route"), sector/geography/business-criteria fields on `audience_segments`
  cover this without a second CRM-shaped domain.
- **Direct outreach plans** (brief Section 22): reuse `distribution_plans`
  with outreach-shaped channel values (`EMAIL`, `WHATSAPP`,
  `DIRECT_BUSINESS_OUTREACH`, `PARTNER_PLATFORM`) rather than a parallel
  table — one lifecycle/approval/budget/Safe-Mode gate for everything
  distributed.
- **New AI task type**: `AUDIENCE_CLASSIFICATION` already existed in
  `AI_TASK_TYPES` (unused since Phase 1) — this phase activates it. For
  Channel Recommendation, the brief explicitly asks for a **deterministic,
  explainable** engine ("No black-box optimization") with AI only as
  optional assistance — so it follows the exact Brand Guardian pattern
  (deterministic rule engine authoritative; optional AI adds rationale text
  only, never changes the channel list/priority). One new task type,
  `CHANNEL_RECOMMENDATION`, was added for that optional enrichment step.
- **Distribution provider readiness** (Google/Meta) is computed in code
  from adapter + env credentials, exactly like
  `src/lib/ai/status.ts::deriveProviderStatus` (directly reused) — no new
  DB table, since these are compile-time known adapters, not
  user-configurable rows the way AI providers/models are.

## 6. Targeting Principle

Target commercial situations and intent only — business use case, sector,
role/function, company type/size, geography, commercial intent, reachable
channel. Never sensitive personal traits (religion, ethnicity, health,
sexual orientation/gender identity, political beliefs, immigration status,
criminal record, genetic data). Enforced by
`src/lib/audience/targeting-guard.ts`: a deterministic, always-authoritative
regex-based rule engine (same authority pattern as
`src/lib/brand-guardian/rules.ts`) that rejects any human-submitted **or
AI-proposed** targeting field containing a prohibited dimension — the AI
classification task's raw output is re-validated server-side before
anything is written, regardless of what the model said
(`src/lib/audience/segments.ts::classifyAudienceSegment`).

## 7. Audience Domain

`audience_segments` + `audience_scores` (`src/lib/audience/segments.ts`,
`src/lib/audience/scoring.ts`):

- A segment carries name/description, `linkedCampaignId`, sector,
  geography, business/role/company/intent criteria, channel eligibility, an
  `estimatedReach` free-text placeholder (never a fabricated number),
  status (`DRAFT`/`NEEDS_REVIEW`/`APPROVED`/`REJECTED`/`ARCHIVED`),
  classification (default `CONFIDENTIAL`), and `isDemo`.
- No person-level CRM record exists anywhere in this schema.

## 8. Targeting Score

`src/lib/audience/scoring.ts` mirrors `src/lib/opportunity/scoring.ts`
exactly: six required dimensions (`problemFit`, `productFit`, `intent`,
`reachability`, `commercialValue`, `evidenceStrength`), each 0-100, plus an
optional seventh (`channelFit`) included in the average only when present.
Total = unweighted average, rounded — no ML, no hidden weighting. Every
score carries per-dimension explanation text and `scoredByUserId`/
`aiProposed`, so who/what generated it is always visible.
`evidenceStrength` is AI-proposed/human-set here (unlike the opportunity
domain, there is no per-audience evidence table in Phase 3 — documented as
a known limitation, Section V of the completion report).

## 9. Audience Intelligence AI Task

`src/lib/ai/tasks/analyze-audience.ts` activates `AUDIENCE_CLASSIFICATION`.
Structured contract: campaign + segment context in, a single JSON object
(sector, geography, business/role/company/intent criteria, suggested
channels, six score proposals, exclusions, caveats) out, Zod-validated
before anything downstream sees it as data
(`src/lib/ai/tasks/run-structured-task.ts`, reused unchanged from Phase 2).
Malformed output → rejected, no segment mutated. Every AI-proposed field is
re-validated by the sensitive-targeting guard (Section 6) before being
written — the system prompt also instructs the model never to carry a
sensitive trait into any field, but the deterministic guard is the actual
enforcement, not the prompt. The mock provider
(`src/lib/ai/adapters/mock.ts`) gained a deterministic `[MOCK]` branch for
this task type, so the flow works with zero credentials.

## 10. Channel Types

`src/lib/distribution/channels.ts` — exactly the 13 planning/channel types
the brief lists (`GOOGLE_SEARCH` … `PARTNER_PLATFORM`). These are
planning-only; live adapter support is a separate, much smaller set (one:
`simulated`) — see `docs/PHASE_3_PROVIDER_ADAPTERS.md`.

## 11. Channel Recommendation Engine

`src/lib/distribution/channel-recommendation.ts` — a deterministic rule
engine (`CHANNEL_RULE_ENGINE_VERSION`), same authority pattern as Brand
Guardian. Scores each of the 13 channel types against campaign objective +
audience segment fields using simple, explainable keyword-match modifiers
(e.g. high-intent commercial-problem language boosts `GOOGLE_SEARCH`;
B2B role/company criteria boosts `LINKEDIN`; Kenya/East-Africa geography
boosts `WHATSAPP`) plus a bonus for explicit segment channel eligibility.
Output: ranked channels (only those clearing a fixed threshold), priority,
rationale, expected funnel role, risks, required assets, and
execution availability (derived from the live provider registry, Section
17). **This ranking is always authoritative — no black-box optimization.**
Optional AI enrichment (`src/lib/ai/tasks/recommend-channels.ts`,
`CHANNEL_RECOMMENDATION` task) may only append one shared narrative
sentence; it cannot add, remove, or reorder a channel. Orchestration +
persistence: `src/lib/distribution/recommendations.ts`
(`channel_recommendations` table, append-only, same non-destructive pattern
as `brand_reviews`).

## 12. Distribution Plan Domain

`distribution_plans` (`src/lib/distribution/plans.ts`). Status lifecycle,
exactly the brief's ten values:

```
DRAFT → (propose/approve budget, optional while DRAFT)
   ↓
(Brand Guardian: BLOCK/REVISE) → NEEDS_REVIEW ──(re-run)──┐
   │                                                       │
   └──(Brand Guardian: PASS)──► AWAITING_APPROVAL ◄────────┘
                                        │
                          (Owner approve)
                                        ↓
                                   APPROVED
                    (Brand Guardian PASS + budget APPROVED + no unpassed
                     referenced creative)
                                        ↓
                                     READY
                    (DistributionGateway.launch() succeeds)
                                        ↓
                                    RUNNING ──(pause)──► PAUSED ──(relaunch)──► RUNNING
                                        │
                              COMPLETED / FAILED / CANCELLED
```

A plan may only be created referencing an `APPROVED` audience segment
(`createDistributionPlan` throws otherwise). Editing a plan's
channel-adapted copy resets `brandGuardianStatus` to `NOT_REVIEWED` so a
stale PASS can never be reused against changed copy. Edits are blocked
once `RUNNING` — pause first.

## 13. Execution Modes

`PLAN_ONLY` (default) / `SIMULATED` / `SANDBOX` / `LIVE`. `LIVE` is
structurally unreachable in this phase — no adapter exists that can serve
it (`src/lib/distribution/router.ts` returns `NOT_AVAILABLE` for
`SANDBOX`/`LIVE` on every channel, since neither stub ad-platform adapter
ever reports configured). Phase 3 ships with zero LIVE adapters, as
intended.

## 14. Human Approval

Unchanged Phase 0/1/2 governance, applied identically to distribution:
`approve` on `audience`/`distribution` is Owner-only under the literal
grant table (Section 4). Launch is gated the same way (`approve` on
`distribution`) since it is the single HIGH-risk consequential action this
phase implements. Every approval/rejection/budget decision is written to
`approval_events`/`budget_approvals` and the audit log.

## 15. Budget Guard

`src/lib/distribution/budget-guard.ts`. `budget_approvals` is append-only
per plan; the current effective budget is the single row with status
`APPROVED` — `approveBudget()` supersedes any prior `APPROVED` row so
exactly one is ever active. Rules enforced, all server-side:

- No negative planned/approved budget, daily cap, or total cap.
- Approved budget cannot exceed `totalCap`.
- A plan already `RUNNING` cannot have a new budget proposed — pause first.
- Proposing a new budget on an `APPROVED`/`READY` plan reverts its status
  to `AWAITING_APPROVAL` — no silent budget increase survives without
  re-approval.
- `assertBudgetApprovedForLaunch()` — called by both
  `markDistributionPlanReady()` and `DistributionGateway.launch()` (defense
  in depth) — throws `BudgetNotApprovedError` unless the latest row is
  `APPROVED` with a non-negative `approvedBudget`.

## 16. Safe Mode

`src/lib/safe-mode/state.ts`'s existing `assertNotSafeMode()` helper
(unchanged) is now called from `DistributionGateway.launch()` before any
budget or adapter work. When Safe Mode is active: launch returns
`SAFE_MODE_BLOCKED` (API surfaces this as HTTP 409, not 500), a
`SAFE_MODE_BLOCKED_EXECUTION` audit event is recorded, and no execution row
is fabricated. Planning/editing/budget-proposing/Brand-Guardian-review all
remain allowed during Safe Mode — verified live (Section T of the
completion report) and in `tests/phase3-db.test.ts`.

## 17. Distribution Provider Architecture

See `docs/PHASE_3_PROVIDER_ADAPTERS.md` for the full adapter interface,
the simulated adapter's design (including the in-memory-state bug found
and fixed during validation), and Google/Meta readiness.

## 18. Brand Guardian Gate

A distribution plan's own channel-adapted copy (`channelStrategy`/`cta`/
`destination`) must itself pass Brand Guardian
(`runDistributionPlanBrandGuardian`, `brand_reviews.subjectType =
"distribution_plan"`) before it can reach `AWAITING_APPROVAL`. Separately,
`markDistributionPlanReady()` also requires every creative variant the plan
references (`creativeVariantIds`) to already have `brandGuardianStatus ===
"PASS"` from its own Phase 2 review. Both checks are enforced server-side,
not just hidden in the UI — a `BLOCK`/`REVISE` result on either blocks
`READY` (see `tests/phase3-db.test.ts`).

## 19. Execution Records

`distribution_executions`. Every launch attempt — success or failure —
creates exactly one row. `externalExecutionId`/`reportedSpend` are only
ever populated by an adapter response, never fabricated by application
code. `isSimulated` defaults `true` (the only adapter implemented this
phase). No fabricated live data anywhere.

## 20. Command Centre Updates

Today dashboard (`src/app/(dashboard)/today/page.tsx`): Work Queue gained
audience-segments-awaiting-review and distribution-plans-awaiting-approval
rows (role-scoped, same `can()`/`scopeFor()` pattern as Phase 2). Outreach
Snapshot replaced its "Not active yet" Phase 2 placeholders with real
counts: campaigns ready for targeting, audience segments, distribution
plans, approved budgets, simulated executions running, and (Owner/
audit-capable roles) blocked Safe Mode execution attempts. No fabricated
figures — rows only render once the viewer's role has visibility.

## 21. Distribution Page

`/distribution` — a tabbed workspace (Plans, Direct Outreach, Channel
Recommendations, Budgets, Executions, Providers), plus a link to
`/audiences`. Plan detail (`/distribution/plans/[id]`) shows campaign/
audience/channel/mode/budget/approval/status/Safe-Mode-effect/execution
history in one place, with role-gated action buttons (Brand Guardian run,
review, mark READY, launch, pause). No fake ad-platform metrics anywhere —
`reportedSpend` is always the real (simulated) adapter figure, clearly
labeled `SIMULATED / NOT LIVE`.

## 22. Demo Scenario

`scripts/seed.ts::seedPhase3DemoScenario()` — continues the existing Phase
2 construction demo once its campaign reaches `READY_FOR_DISTRIBUTION`
(idempotent; if that hasn't happened yet, it logs a message and skips
gracefully rather than fabricating a shortcut). Unlike a raw insert, every
step calls the **real** service/gateway functions (`createAudienceSegment`
→ `reviewAudienceSegment` → `createDistributionPlan` → `proposeBudget` →
`approveBudget` → `runDistributionPlanBrandGuardian` →
`reviewDistributionPlan` → `markDistributionPlanReady` →
`DistributionGateway.launch()`), so the seeded demo state is produced by
the actual Phase 3 architecture, not fabricated — proving Section 19's
"prove the entire execution architecture without spending money" in
practice. Every seeded row is `isDemo: true`; the execution is visibly
`SIMULATED / NOT LIVE`.

## 23. Non-Goals (confirmed not built)

Matches the brief's Section 39 list exactly: no commercial contact memory,
no unified audience profiles, no cross-campaign identity resolution, no
attribution engine, no conversion funnel, no retargeting, no
abandoned-SecureLink recovery, no next-best-action, no SecurePay
product-event ingestion, no automated upsell, no Growth Director
reasoning, no model benchmarking, no autonomous budget optimization, no
autonomous ad spending (zero LIVE adapters exist), no full CRM, no
HubSpot/Clay/n8n, no production WhatsApp/email sending, no community
features, no public analytics API. Confirmed by direct code review and
grep — see `docs/PHASE_3_TEST_AND_VALIDATION_REPORT.md` Section 11.
