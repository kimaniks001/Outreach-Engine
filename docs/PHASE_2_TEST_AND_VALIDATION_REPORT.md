# Phase 2 Test & Validation Report

Status: Phase 2
Last updated: 2026-08-11
Environment: Node v24.18.1, npm 11.16.0, PostgreSQL 16 (Docker), macOS/Darwin, no `ANTHROPIC_API_KEY` configured

## 1. Lint

```
$ npm run lint
> eslint .
(no output — 0 errors, 0 warnings)
```

## 2. Typecheck

```
$ npm run typecheck
> tsc --noEmit
(no output — 0 errors)
```

## 3. Unit & Integration Tests

```
$ npm test
> vitest run

 Test Files  11 passed (11)
      Tests  109 passed (109)
```

Re-run twice to confirm determinism (both runs: 11/11 files, 109/109
tests). `vitest.config.ts` sets `fileParallelism: false` — the two spawned
`next dev` E2E files (Phase 1's and Phase 2's) previously produced spurious
404/500s when Vitest ran them as separate worker processes concurrently
(confirmed as environmental contention, not an application bug, by
reproducing the same request manually against a single dev server and
getting a clean 201). Sequential file execution costs a few seconds and
makes the suite fully deterministic.

| File | Covers |
|---|---|
| `tests/brand-guardian.test.ts` | Deterministic rule engine: blocks wallet/bank/M-PESA-competitor/payment-app/escrow framing, flags unsupported claims and pricing as REVISE, passes clean agreement-layer copy, BLOCK takes priority over REVISE, every finding carries a doctrine reference |
| `tests/opportunity-scoring.test.ts` | Score component math (unweighted average, clamping), evidence-strength derivation (no evidence → floor, verified > weak, rejected excluded, corroboration bonus), money-flow doctrine resolution (unknown → `NEEDS_DOCTRINE_REVIEW`, never hallucinated) |
| `tests/phase2-rbac.test.ts` | Full Phase 2 capability matrix: intelligence raw/approved scope, campaigns create/edit/approve per role, content resource edit rights, model-config/credentials remain Owner-only |
| `tests/phase2-db.test.ts` | Signal creation + provenance retention, MANUAL/UNVERIFIED detection, evidence cannot start VERIFIED, malformed AI output rejected (no opportunity created), full opportunity analysis via mock provider, campaign-opportunity linkage, campaign cannot approve without Brand Guardian PASS, BLOCKed campaign stays blocked, approval is audited, terminal status is READY_FOR_DISTRIBUTION (never a publish/distributed state), creative variants ≤3 with all required fields, no live image generation required |
| `tests/ai-gateway-phase2.test.ts` | Mock provider AVAILABLE with zero credentials, Anthropic stays NOT_CONFIGURED without a key, every execution records routing reason/latency/cost, never falls back to an unapproved provider (honest NO_AVAILABLE_MODEL), no direct adapter bypass |
| `tests/phase2-http-e2e.test.ts` | Full HTTP flow: signal → analyze → approve → campaign → Brand Guardian → creative → approve → READY_FOR_DISTRIBUTION; Content & Engagement denied on signals/opportunities/campaigns/admin; wrong password never succeeds |
| `tests/rbac.test.ts`, `tests/ai-router.test.ts`, `tests/auth.test.ts`, `tests/db.test.ts`, `tests/http-e2e.test.ts` | Phase 1 suite, re-run unmodified except one fixture (`AIProvider.isMock` field added) — all still pass, confirming Phase 1 behavior is preserved |

Explicit brief Section 30 requirements and where they're covered:

- **Signal creation** — `phase2-db.test.ts`.
- **Provenance retained** — `phase2-db.test.ts` ("evidence provenance fields are retained exactly as submitted").
- **Unverified signal cannot become VERIFIED without explicit review** — `phase2-db.test.ts` ("new evidence cannot start as VERIFIED").
- **Malformed AI output rejected** — `phase2-db.test.ts`.
- **Opportunity score component math/explanation** — `opportunity-scoring.test.ts`.
- **Content & Engagement cannot access raw sources** — `phase2-rbac.test.ts` + live in `phase2-http-e2e.test.ts` (403 on `/api/intelligence/signals`).
- **Analyst cannot create campaigns** — `phase2-rbac.test.ts` ("ANALYST cannot view or create campaigns at all").
- **Strategist can create/edit campaign drafts** — `phase2-rbac.test.ts`.
- **Owner/Growth Director approval behavior matches doctrine** — `phase2-rbac.test.ts` ("OWNER and GROWTH_DIRECTOR (and only they) can approve campaigns").
- **Admin/model/credentials remain protected** — `phase2-rbac.test.ts` (model-config/credentials sections, unchanged Owner-only).
- **No direct provider bypass** — `ai-gateway-phase2.test.ts`.
- **NOT_CONFIGURED provider remains unavailable** — `ai-gateway-phase2.test.ts`.
- **Configured mock provider executes** — `ai-gateway-phase2.test.ts` + `phase2-db.test.ts`.
- **Routing reason recorded** — `ai-gateway-phase2.test.ts`.
- **Usage/cost/latency recorded** — `ai-gateway-phase2.test.ts`.
- **Brand Guardian blocks "SecurePay is an escrow wallet"** — `brand-guardian.test.ts`, literal test case.
- **Flags unsupported claims** — `brand-guardian.test.ts`.
- **Passes approved agreement-layer positioning** — `brand-guardian.test.ts`.
- **Returns structured PASS/REVISE/BLOCK** — `brand-guardian.test.ts` + `phase2-db.test.ts`.
- **Campaign linked to opportunity** — `phase2-db.test.ts`.
- **Cannot become APPROVED without Brand Guardian review** — `phase2-db.test.ts`.
- **Approval audited** — `phase2-db.test.ts` (`approval_events` row asserted).
- **No publish/distribution action exists** — `phase2-db.test.ts` + static grep (Section 9 below).
- **Max 3 default variants, each with headline/body/CTA/image concept** — `phase2-db.test.ts`.
- **Brand Guardian review available for creative** — verified live (Section 6) and via the shared `runBrandGuardian` used for both subject types.
- **No live image generation required** — `phase2-db.test.ts` ("works without live image generation").

## 4. Build

```
$ npm run build
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (33/33)

33 routes total (5 new Phase 1 admin/auth routes carried over, 20 new
Phase 2 page/API routes added: intelligence signals/opportunities,
campaigns, creative variants, and their sub-actions)
Middleware: 39.6 kB
```

## 5. `git diff --check`

```
$ git diff --cached --check
(no output — exit 0, no whitespace errors)
```

## 6. Manual End-to-End Walkthrough (Owner flow)

Performed live against a running dev server before writing the automated
E2E test, then re-verified via the automated test:

1. Login as Owner → 200.
2. `POST /api/intelligence/signals` — create a signal → 201.
3. `POST /api/intelligence/signals/{id}/analyze` — routes to the mock
   provider (no `ANTHROPIC_API_KEY` in this environment) → 201, opportunity
   created with status `NEEDS_REVIEW`, score computed, evidence-strength
   correctly scored at the floor (no evidence attached).
4. `POST /api/intelligence/opportunities/{id}/review` `{action: APPROVE}` →
   200, status `APPROVED`.
5. `POST /api/campaigns` from that opportunity → 201, status `DRAFT`.
6. `POST /api/campaigns/{id}/brand-guardian` → 200, result `PASS` (clean
   agreement-layer copy), campaign status → `AWAITING_APPROVAL`.
7. `POST /api/campaigns/{id}/creative` → 201, 3 variants generated via the
   mock provider (after fixing a seed gap — see Section 8), each with
   headline/body/CTA/image concept.
8. `POST /api/campaigns/{id}/review` `{action: APPROVE}` → 200, status
   `READY_FOR_DISTRIBUTION`. Confirmed: no further action/endpoint exists to
   publish or distribute it.
9. Repeated as Content & Engagement: `/api/intelligence/signals` → 403,
   `/api/intelligence/opportunities` → 403, `/api/campaigns` → 403,
   `/api/campaigns/{id}/creative` (GET) → 200 (reaches creative content via
   the `content` resource), `/admin/providers` → 307 redirect (denied).
10. Repeated as Strategist: `/api/intelligence/opportunities` → 200
    (approved-scope only), `/api/intelligence/opportunities/{id}/review` →
    403 (cannot approve).
11. Repeated as Analyst: `POST /api/campaigns` → 403.

No browser-automation tool (Playwright, etc.) is installed in this
environment — see the same note in `docs/PHASE_1_TEST_AND_VALIDATION_REPORT.md`
Section 6. `tests/phase2-http-e2e.test.ts` reproduces the Owner and Content
& Engagement portions of this flow as a repeatable automated test.

## 7. Secret Scan

```
$ git status --short | grep -i env
M  .env.example
```

`.env.local` confirmed absent from the staged changeset. A pattern scan for
AWS/Anthropic/OpenAI/GitHub token shapes and PEM private-key headers across
every staged file returned no matches. Every dev password printed by this
session's `scripts/seed.ts` runs was searched for verbatim across all
tracked `.ts`/`.tsx`/`.md`/`.json` files — zero matches (an earlier looser
regex flagged false positives on ordinary 16-character identifiers like
`CONTENT_ENGAGEMENT`; re-run with exact-string matching to confirm).

## 8. Bugs Found and Fixed During This Phase's Own Validation

- **Seed data gap**: the mock/test AI model's `approvedTaskTypes` list
  initially omitted `CREATIVE_IDEATION`, so creative generation silently
  fell back to the deterministic template generator instead of exercising
  the mock AI path. Caught by the manual walkthrough (Section 6, step 7),
  fixed in `scripts/seed.ts`, re-verified live.
- **Vitest file-parallelism contention** (Section 3) — fixed via
  `fileParallelism: false`.

Both are documented here rather than silently fixed, per this repository's
practice of writing up what validation actually caught.

## 9. Protected-Endpoint and No-Bypass Verification

- Every route under `src/app/api/intelligence/`, `src/app/api/campaigns/`,
  and `src/app/api/creative/` calls `requireApiUser`/`requireApiCapability`
  from `src/lib/rbac/guard.ts` before touching data — verified by reading
  every route file and by the live/automated 403 checks above.
- `grep -rn "sendOutreach\|publishCampaign\|launchAd\|adSpend\|meta.*ads.*api\|google.*ads.*api\|whatsapp\|hubspot\|clay\b\|n8n" src/` returns nothing.
- `grep -rln "from \"./adapters\"\|from \"@/lib/ai/adapters\""` across
  `src/lib/` matches only `src/lib/ai/gateway.ts` and
  `src/lib/ai/registry.ts` — no business-logic module imports a provider
  adapter directly.
- `fetch(` inside `src/lib/ai/` appears only in
  `src/lib/ai/adapters/anthropic.ts` — the only external network call in
  the entire AI subsystem.

## 10. Demo Data Labeling Verification

- `market_signals.is_demo`, `opportunities.is_demo`, `campaigns.is_demo`
  all default `false`; the seeded demo signal is the only row with
  `is_demo: true`, and that flag propagates automatically to any
  opportunity/campaign created from it (`src/lib/intelligence/opportunities.ts`,
  `src/lib/campaigns/campaigns.ts`).
- Every list/detail page that renders a signal, opportunity, or campaign
  shows a `DEMO / SAMPLE` badge when `isDemo` is true — verified visually
  via the pages' source and live via API response inspection.

## 11. Phase 3+ Scope Check

Confirmed absent from the codebase: any ad-platform SDK/API client, any
CRM/outreach-sending code, any commercial-memory or audience-profiling
table, any attribution/conversion-funnel table, any product-event
integration, any crawler/scraper dependency (`grep -i "cheerio\|puppeteer\|playwright\|scrape\|crawl" package.json` → no matches). The database schema
added this phase (`market_signals`, `source_evidence`, `opportunities`,
`opportunity_scores`, `campaigns`, `creative_variants`, `brand_reviews`,
`approval_events`) contains nothing from the brief's explicit avoid-list
(ad accounts, ad spend, audience commercial memory, attribution, contact
profiles, retargeting journeys).

## 12. Final Validation Status

All items in Section 34 of the brief were run and passed. No blockers.
