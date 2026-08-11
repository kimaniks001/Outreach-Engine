# Phase 2: Intelligence + Campaign + Creative

Status: Phase 2 — implemented
Last updated: 2026-08-11

## 1. Purpose

Phase 2 makes the Outreach Engine useful for the first time: a real Market
Intelligence domain, AI-assisted opportunity analysis with transparent
scoring, a deterministic Brand Guardian, a Campaign lifecycle gated by
human approval, and an image-first Content & Creative Studio. It proves the
full chain:

```
INTELLIGENCE → OPPORTUNITY → BRAND REVIEW → CAMPAIGN → CREATIVE → HUMAN APPROVAL
```

Distribution/publishing execution remains entirely out of scope — every
campaign that clears approval lands on `READY_FOR_DISTRIBUTION` and stops
there. That verb becomes real in Phase 3.

## 2. Repository Inspection Before Implementation

Read before writing any code: `README.md`, `docs/ROADMAP.md`,
`docs/OUTREACH_ENGINE_DOCTRINE.md`, `docs/SECUREPAY_POSITIONING_RULES.md`,
`docs/AI_GOVERNANCE.md`, `docs/ACCESS_CONTROL_MODEL.md`,
`docs/MODEL_CONTROL_PLANE.md`, `docs/SOURCE_PROVENANCE.md`,
`docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md`, `docs/ARCHITECTURE.md`, both
Phase 1 docs, all eight ADRs, and the full Phase 1 implementation
(`src/lib/db/schema.ts`, `src/lib/rbac/*`, `src/lib/ai/*`). No contradiction
between this brief and locked doctrine was found. See Section 4 for the one
RBAC reading decision this required.

## 3. Money-Flow Doctrine Is Not Pre-Existing — It's This Brief's Text

`docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md` and
`docs/OUTREACH_ENGINE_DOCTRINE.md` mention SecureLink/KeyContract as
examples of SecurePay journeys but never define the four money-flow
categories (ONE→ONE / MANY→ONE / ONE→MANY / MANY→MANY) this phase's brief
specifies. There is no prior, more-authoritative doctrine source in this
repository for that taxonomy. This build treats the brief's own Section 11
text as the authoritative doctrine to encode — consistent with that same
section's instruction not to invent beyond what's given — and implements it
as a fixed, non-extensible set in `src/lib/opportunity/money-flow.ts`. See
ADR territory: if a future phase needs to add a fifth money-flow type, that
requires a new doctrine source, not an unreviewed code change.

## 4. RBAC: A Conservative, Literal Application — Not a Doctrine Change

`docs/ACCESS_CONTROL_MODEL.md` Section 4's capability table (Phase 0,
carried into Phase 1) grants `create`/`edit` on the `intelligence` resource
to **OWNER only** — Growth Director and Strategist are `view`-only there.
Rather than silently broadening that table to make a smoother Strategist
workflow, this build applies it exactly as written, and uses the table's own
"approved" vs "raw" scope split (originally designed for exactly this
purpose — see `docs/SOURCE_PROVENANCE.md` Section 4, "conclusions without
sources") to give each role a coherent, non-degraded experience anyway:

| Role | Signals / source evidence (raw intelligence) | Opportunities | Create/edit signals, evidence, opportunities | Approve/reject opportunities |
|---|---|---|---|---|
| OWNER | full | full | yes | yes |
| GROWTH_DIRECTOR | view (raw scope — sees everything Owner sees) | view | no | no |
| STRATEGIST | **no access** | view — **APPROVED only** | no | no |
| CONTENT_ENGAGEMENT / DISTRIBUTION_SALES / ANALYST | no access | no access | no | no |

This produces a deliberate, sensible pipeline: **Owner** captures signals,
triggers AI analysis, and is the sole approver of opportunities (evidence
before action — `docs/OUTREACH_ENGINE_DOCTRINE.md` Section 3). Once an
opportunity is APPROVED, it becomes visible to **Strategist**, who can build
a campaign from it. This is not a workaround — it is what the "conclusion
without raw source" pattern was designed for, applied for the first time.

Campaigns and creative content follow the same literal-table discipline:

| Role | `campaigns` resource | `content` resource (creative copy) |
|---|---|---|
| OWNER | full (create/edit/approve) | full |
| GROWTH_DIRECTOR | view + **approve** | view |
| STRATEGIST | view/create/edit (no approve) | view (no edit) |
| CONTENT_ENGAGEMENT | **none** | view/create/edit (approved scope) |
| DISTRIBUTION_SALES | view (approved scope) | none |
| ANALYST | none | none |

Content & Engagement's Phase 0 role description ("must not see confidential
strategy") maps precisely onto this: they reach campaign work exclusively
through the `content` resource (creative variants — headline/body/CTA/image
concept), never through `campaigns` (strategy, opportunity link, Brand
Guardian internals). The Campaigns page (Section 10 below) branches its
entire view on this distinction rather than hiding a few fields.

**Nothing here required expanding any Phase 0 grant.** Where the literal
table felt restrictive (e.g., Strategist not creating signals directly),
this build kept the restriction and left it as a documented Phase 3+
candidate — see `docs/ACCESS_CONTROL_MODEL.md` Section 4's own note that the
table "is expected to be refined once real usage patterns emerge," which is
an invitation for a future *reviewed* change, not license to expand it
silently now.

## 5. Market Intelligence Domain

`market_signals` + `source_evidence` tables
(`src/lib/db/schema.ts`, `src/lib/intelligence/signals.ts`,
`src/lib/intelligence/evidence.ts`):

- A signal carries title, summary, type (`WEB`/`NEWS`/`SOCIAL`/`INDUSTRY`/
  `GOVERNMENT`/`COMPETITOR`/`CUSTOMER_FEEDBACK`/`INTERNAL_OBSERVATION`/
  `MANUAL`), status, tags, notes, classification, and an `isDemo` flag.
- Evidence carries the full provenance field set from
  `docs/SOURCE_PROVENANCE.md` Section 2 (source name/reference/type,
  retrieval/publication timestamps, extracted claim, confidence,
  verification status, contradictions notes).
- **A signal with zero evidence rows is MANUAL/UNVERIFIED by construction**
  — there is no flag to fake; the UI and scoring both key off "does this
  signal have any evidence rows at all."
- **New evidence can never start VERIFIED.** `addEvidence()` always sets
  `NEEDS_REVIEW` or `WEAK_EVIDENCE` (based on submitted confidence);
  `VERIFIED` is reachable only through the separate `reviewEvidence()`
  action, which is its own audited, Owner-only step.
- No autonomous web crawling or social scraping exists anywhere in this
  codebase — signals are entered through the intake API/UI, which is
  designed so an external collector could POST to the same
  `/api/intelligence/signals` endpoint later without a redesign.

## 6. Opportunity Domain + Scoring

`opportunities` + `opportunity_scores` tables
(`src/lib/intelligence/opportunities.ts`, `src/lib/opportunity/scoring.ts`):

- An opportunity carries every field the brief's Section 9 lists: problem,
  audience, sector, geography, SecurePay relevance, money-flow
  mapping/product note, evidence summary, confidence, score, urgency,
  marketing angle/CTA/risks, status, and the AI usage record it came from.
- **Scoring is simple and explainable, not machine learning**: seven
  dimensions (`problemFit`, `securepayFit`, `audienceClarity`,
  `commercialValue`, `reachability`, `evidenceStrength`, `urgencyTiming`),
  each 0-100, total = unweighted average, rounded. `evidenceStrength` is the
  one dimension computed **deterministically** from the actual evidence
  rows (not AI-proposed) — a signal with no evidence scores it at the floor
  (5/100), so a thin/unverified signal can never quietly produce a
  high-confidence-looking opportunity. The other six dimensions are
  AI-proposed but stored with their raw values, fully visible and
  reviewable in the UI (`/intelligence/opportunities/[id]`).
- Status lifecycle: `DRAFT` → `NEEDS_REVIEW` (where AI analysis lands
  automatically) → `APPROVED` / `REJECTED` / `ARCHIVED`, Owner-only per
  Section 4 above, every transition audited via `approval_events` and the
  audit log.

## 7. SecurePay Product / Money-Flow Mapping

`src/lib/opportunity/money-flow.ts` — see Section 3. AI is instructed (in
the analysis system prompt) to choose one of exactly four types or return
`NEEDS_DOCTRINE_REVIEW`, and **the application never trusts that choice
verbatim**: `resolveMoneyFlowMapping()` re-validates the AI's raw string
against the fixed doctrine set server-side and coerces anything unrecognized
to `NEEDS_DOCTRINE_REVIEW` regardless of what the model said. No new
SecurePay product name, feature, or price is ever introduced by this code.

## 8. Market Intelligence AI Task

`src/lib/ai/tasks/analyze-signal.ts` activates `OPPORTUNITY_CLASSIFICATION`
(the Phase 1 task type). The structured prompt contract:

- **Input**: signal title/summary/type, every evidence row (source, claim,
  verification status, confidence) or an explicit "no evidence — MANUAL/
  UNVERIFIED" marker, SecurePay's positioning statement and prohibited
  framings, and the four-item money-flow doctrine from Section 3.
- **Output**: a single JSON object (problem, audience, sector, geography,
  SecurePay relevance, money-flow mapping, product note, six score
  proposals, evidence reasoning, caveats, recommended next step), validated
  with Zod (`src/lib/ai/tasks/run-structured-task.ts`) before anything
  downstream sees it as data.
- **Malformed output is rejected, not repaired or guessed at.** If the raw
  text isn't valid JSON, or doesn't satisfy the schema, the task returns
  `MALFORMED_OUTPUT` and **no opportunity is created** — the API returns
  422 with the reason so the caller can retry. See `tests/phase2-db.test.ts`
  ("malformed AI output is rejected safely").
- Every execution — success or failure — is recorded in `ai_usage_records`
  (provider, model, routing reason, latency, tokens, estimated cost) and as
  an `AI_EXECUTION` audit event, per `docs/AI_GOVERNANCE.md` Section 6.

## 9. Brand Guardian

`src/lib/brand-guardian/` — a doctrine-checking **service**, not an
autonomous agent, per the brief's Section 13.

- **The deterministic rule engine (`rules.ts`) is always authoritative.**
  It pattern-matches the exact prohibited framings from
  `docs/SECUREPAY_POSITIONING_RULES.md` Section 3 (wallet, bank, M-PESA
  competitor, ordinary payment app, escrow) → `BLOCK`; unsupported
  absolute/compliance claims ("guaranteed", "100% safe", "legally binding",
  "regulated by") and any pricing reference → `REVISE`; clean text → `PASS`.
  This works with **zero AI availability** — it is plain regex matching, so
  positioning enforcement never depends on a model being configured.
- **AI enrichment is optional and cannot change the verdict.** When the
  rule engine returns `REVISE`/`BLOCK`, `runBrandGuardian()` additionally
  asks the `BRAND_REVIEW` AI task for one sentence of human-readable
  context, appended to `reasons` — never allowed to soften or override the
  deterministic result.
- Output is always exactly `PASS` / `REVISE` / `BLOCK` plus reasons,
  offending statements, a recommended correction, and doctrine references —
  stored in `brand_reviews`, scoped to either a campaign or a creative
  variant (`subjectType`).

## 10. Campaign Domain

`campaigns` table (`src/lib/campaigns/campaigns.ts`). Lifecycle as
implemented (a simplified, documented subset of the brief's suggested
enum — all values still exist in the schema for forward-compatibility):

```
(created from an APPROVED opportunity, Owner/Strategist only)
        ↓
      DRAFT  ──(Brand Guardian: BLOCK/REVISE)──►  NEEDS_REVISION ──(re-run)──┐
        │                                                                    │
        └──(Brand Guardian: PASS)──► AWAITING_APPROVAL ◄─────────────────────┘
                                            │
                          (Owner/Growth Director approve)
                                            ↓
                                READY_FOR_DISTRIBUTION
                                  (terminal — Phase 2 stops here)
                          (reject at any approval step) → REJECTED
```

Two intentional simplifications, both documented rather than silently
decided: campaigns are created directly into `DRAFT` (the brief's `IDEA`
pre-stage is a valid enum value but isn't used by the standard flow), and
approval moves straight to `READY_FOR_DISTRIBUTION` (no separate resting
`APPROVED` state — the `approval_events` row is the durable record that
approval happened). **A campaign cannot become approved without a passing
Brand Guardian review** — `reviewCampaign()` throws if
`brandGuardianStatus !== "PASS"`, enforced server-side, not just hidden in
the UI (see `tests/phase2-db.test.ts`).

No publish/distribution action exists anywhere in this codebase — grep for
`sendOutreach`/`publishCampaign`/`launchAd`/`adSpend` returns nothing.

## 11. Content & Creative Studio

`src/lib/creative/variants.ts`, `src/lib/ai/tasks/generate-creative.ts` —
image-first, not image-only, per Section 16-18.

- Generates up to **3** variants per action (`A: Problem-led`,
  `B: Agreement-led`, `C: Outcome-led`), each with headline, body, CTA,
  **image concept** (a text creative brief/visual direction — never a
  generated image), rationale, and suggested aspect ratios.
- **AI-first with a deterministic, always-available fallback.** If AI is
  unavailable, errors, or returns output that fails schema validation, a
  template-based generator (`buildDeterministicVariants()`) produces the
  same three angles from the campaign's own fields. Creative Studio **never
  simply fails** — this is what the brief's "succeeds if it can produce a
  high-quality image creative brief even before automated image generation
  is wired" requirement means in practice here. No image-generation
  provider is integrated in Phase 2, and none was needed to satisfy this
  requirement.
- Content & Engagement can edit variant copy (`headline`/`body`/`cta`) and
  independently trigger a variant-scoped Brand Guardian review — both
  gated behind the `content` resource's `edit` capability (Section 4).

## 12. AI Provider Integration

See `docs/PHASE_2_AI_PROVIDER_INTEGRATION.md` for the full write-up: one
live provider (Anthropic, via plain REST/fetch, no SDK dependency added),
plus a deterministic mock/test provider that needs zero credentials and is
always available, so the entire flow above works with or without
`ANTHROPIC_API_KEY` set.

## 13. Command Centre Updates

- **Today dashboard**: Work Queue now shows real counts (opportunities
  awaiting review, campaigns awaiting approval, blocked/needs-revision
  campaigns), scoped to what the viewer's role can actually see — a role
  with no intelligence/campaign access sees nothing fabricated, just an
  absence of those rows. Outreach Snapshot shows real signal/opportunity/
  campaign counts the same way. A new "Recent AI executions" card (Owner/
  Growth Director only) lists the last 5 `ai_usage_records`.
- **Intelligence** (`/intelligence`): real Signals and Opportunities
  workspaces — see Section 14.
- **Campaigns** (`/campaigns`): real campaign list/detail, or a
  content-only variant view for Content & Engagement — see Section 10.

## 14. Intelligence & Campaigns Pages

- `/intelligence/signals` (Owner/Growth Director only — raw scope): list +
  create form, evidence-count/MANUAL-UNVERIFIED badge per signal.
- `/intelligence/signals/[id]`: full evidence list with per-item
  verification-state controls, "Analyze signal" action.
- `/intelligence/opportunities`: status-filterable list (Strategist
  automatically sees only `APPROVED`); detail page shows the full score
  breakdown, AI execution info (provider/model/routing reason/latency/
  cost), and — once approved — a "Create Campaign" form (Owner/Strategist).
- `/campaigns`: full strategy table for roles with `campaigns` access, or a
  flat creative-variant list (grouped by campaign name only) for Content &
  Engagement.
- `/campaigns/[id]`: strategy, Brand Guardian result, creative variants
  (with inline edit for Content & Engagement / Owner), approval actions
  (Owner/Growth Director), approval history.

## 15. Demo Scenario

`scripts/seed.ts` seeds exactly one demo signal (idempotent — safe to
re-run), matching the brief's Section 29 example: *"Contractors are being
paid large deposits before work milestones are completed."* Marked
`isDemo: true`, and deliberately left with **zero source evidence**, so
running it through Analyze demonstrates the honest MANUAL/UNVERIFIED
scoring path rather than presenting itself as sourced market intelligence.
`isDemo` propagates automatically to the opportunity and any campaign
created from it. The UI badges `isDemo` records with a visible **DEMO /
SAMPLE** tag everywhere they appear (signal list/detail, opportunity list/
detail, campaign list/detail) — live and demo data are never visually
ambiguous.

Walking it through as Owner (`docs/PHASE_2_TEST_AND_VALIDATION_REPORT.md`
Section 6 has the exact verified sequence) reproduces the brief's full
narrative end to end, including typing in the suggested campaign tagline
*"Agree on the milestone. Let the money follow."*, which passes Brand
Guardian cleanly (verified in `tests/brand-guardian.test.ts`).

## 16. Non-Goals (confirmed not built)

Matches the brief's Section 33 list: no autonomous web crawling or social
scraping, no continuous background monitoring, no Google/Meta/TikTok/
LinkedIn Ads execution or paid-media spend, no social/email/WhatsApp
outreach, no Clay/HubSpot/n8n, no commercial contact memory or audience
lifecycle profiles, no retargeting, no abandoned-SecureLink recovery, no
SecurePay product-event integration, no attribution engine or conversion
funnel, no public analytics API, no Growth Director reasoning, no model
benchmarking or autonomous model switching, no autonomous agents, no
community features, no video generation. Phase 3 has not begun.
