# Production Readiness / Activation Review

Status: Post-roadmap review — **NOT Phase 6**
Branch: `production-readiness-activation-review`
Reviewed against: `main` @ merge commit `81d2db6` (PR #6, Phase 5 — final planned phase)
Last updated: 2026-08-11

## 0. Purpose and Operating Mode

Phases 0–5 built the SecurePay Outreach Engine end to end. This document
answers a different question than any phase brief: **what must be true
before the Outreach Engine can safely move from a complete build into real
operation?**

This is not a new roadmap phase. No new capability was designed here. The
scope was: inspect the real implementation (not the completion reports'
claims about it), classify every major capability honestly, fix the
narrow set of gaps that would make initial production activation unsafe,
and document exactly what is required to go live.

Principles followed: inspect before changing; evidence before assumption;
no fake readiness; no fake integrations; no fake credentials; no
production changes beyond what this review required; no live ad spend; no
bulk external outreach; no destructive infrastructure changes; no secrets
exposed; all locked doctrine and ADRs preserved unchanged; GitHub remains
source of truth.

## 1. Classification Model

Every capability below is classified as exactly one of:

- **READY** — works today, no operator action required beyond normal
  deployment.
- **READY WITH OPERATIONAL SETUP** — code is correct and complete; an
  operator must configure something (a credential, a hosting choice, an
  environment variable) before it is live.
- **READY WITH CONTROLLED LIMITATION** — works today, deliberately or
  currently scoped narrower than "full" (e.g. simulated-only, internal-only,
  manual-only), and that limitation is safe for initial launch.
- **BLOCKED — EXTERNAL DEPENDENCY** — nothing left to fix in this
  repository; a party outside it (SecurePay's own engineering team, a
  hosting provider, Google/Meta) must act first.
- **BLOCKED — ENGINEERING GAP** — a real code defect stands in the way.
  (None remain open after this review — see Section 4.)
- **NOT REQUIRED FOR INITIAL LAUNCH** — deliberately out of scope for the
  initial operating scope defined in Section 2, not a defect.
- **DEFERRED ENHANCEMENT** — a legitimate future improvement, not a gap.

## 2. Initial Production Scope

**INITIAL LAUNCH** (what this review qualifies the system for): internal
SecurePay growth team use, Owner-controlled access, Growth Director
recommendations, market intelligence, campaign planning, creative
preparation, audience targeting, simulated distribution, real AI provider
if credentials are supplied, SecurePay product-event ingestion if SecurePay
supplies an endpoint/secret. No uncontrolled autonomous paid-media
execution. No uncontrolled bulk outreach.

**FULL EXTERNAL DISTRIBUTION ACTIVATION** (explicitly out of scope for
initial launch, tracked separately in Section 15 / `docs/ACTIVATION_PLAN.md`
Gates D/E): live Google Ads, live Meta Ads, live email/WhatsApp/partner
outreach. None of these are required for initial launch and none are
implemented beyond boundary-only stubs today.

These are two different milestones. This review only certifies the first.

## 3. What Was Verified, Not Assumed

Per the brief's explicit instruction not to trust the completion reports,
every claim in this document was checked against the real code: schema,
migrations, seed/bootstrap scripts, middleware, RBAC guard, Safe Mode
state, AI Gateway/router/adapters, AI budget engine, distribution
adapters, product-event ingestion, Analytics API routes, retention code,
audit log, and every call site of the functions touched. A fresh
PostgreSQL database was migrated and bootstrapped live during this review
(Section 11). The full test suite, lint, typecheck, and production build
were run against the final state (Section 16).

## 4. What Was Found and Fixed (Engineering Changes Made in This Review)

Per the brief, engineering changes in this review were limited to a narrow
list of production-blocking classes. Four real gaps were found and fixed;
everything else below is either already correct or an explicitly
documented, non-blocking limitation.

### 4.1 CRITICAL — Demo data contaminated every production aggregate (FIXED)

**Finding.** None of `computeCampaignScorecard`, `computeChannelScorecard`,
`computeProductScorecards`, `computeAudienceScorecard`,
`computeEfficiencySummary`, `computeRoi`, `computeFunnelSummary`, or
`computeImpactSummary` (the functions behind the Impact dashboard and
every `/api/analytics/*` route) filtered out `isDemo: true` rows. Growth
Director's `generateCandidates()` tagged each candidate with `isDemo`
(inherited from its source campaign/plan/experiment/profile) but never
excluded them from ranking, so a demo campaign's funnel drop-off could
appear in the same ranked "What should SecurePay do next?" list as real
evidence. Per the brief: *"If Growth Director or Impact could mix demo +
real activity in production analytics, classify as BLOCKED until fixed."*

**Fix.** Every function above now excludes `isDemo: true` rows by default
(`{ includeDemo?: boolean }` on the Impact/Attribution functions,
`{ includeDemo?: boolean }` on `generateCandidates`/
`generateAndPersistRecommendations`/`listCurrentRecommendations`/
`whatShouldSecurePayDoNext`). No production call site (every API route,
every dashboard page) passes `includeDemo`, so production behavior is
demo-free automatically. AI cost (`ai_usage_records`) is deliberately
**never** demo-filtered — a real AI call costs real money regardless of
which campaign triggered it, and that table has no `isDemo` column by
design. Only `scripts/seed.ts`'s own demo walkthrough explicitly passes
`includeDemo: true` to keep the local-dev demo experience working.

**Verified live** (Section 11.4): against the real dev database (which
carries the Phase 2–5 demo walkthrough data plus accumulated test-suite
fixtures), `GET /api/impact/summary` and `GET /api/analytics/impact` now
return `reachedProfiles: 0` / `engagementProfiles: 0` for the demo
campaign's activity by default, and `POST /api/growth-director/recommendations`
returned 12 recommendations, every one `isDemo: false`.

Files changed: `src/lib/impact/scorecards.ts`, `src/lib/impact/roi.ts`,
`src/lib/attribution/funnel.ts`, `src/lib/growth-director/candidates.ts`,
`src/lib/growth-director/engine.ts`, `tests/phase5-impact.test.ts`.

### 4.2 Unsafe seed behavior / missing production bootstrap (FIXED)

**Finding.** `npm run db:seed` (a) creates 6 accounts at fixed, predictable
`@dev.local` emails, (b) uses `onConflictDoUpdate`, which silently resets
the password/role/active-state of any existing user at those emails on
every re-run, and (c) unconditionally cascades a full demo scenario — with
**zero guard** against being run against a production database. No
separate mechanism existed to create a single production Owner account
without also seeding demo data.

**Fix.**
- `scripts/seed.ts` now refuses to run when `NODE_ENV=production` (verified
  live in Section 11.1).
- A new `scripts/bootstrap-production.ts` (`npm run db:bootstrap`) creates
  **exactly one** Owner account from operator-supplied
  `BOOTSTRAP_OWNER_EMAIL`/`BOOTSTRAP_OWNER_PASSWORD` env vars (no default,
  refuses to run without both, refuses passwords under 12 characters),
  initializes AI provider/model rows, sets Safe Mode to **SAFE_MODE (ON)**,
  and seeds **zero** demo data. It refuses to run a second time once any
  OWNER account already exists, so it can never overwrite a production
  Owner's credentials.
- The provider/model seed data was extracted into a shared, side-effect-free
  module (`scripts/seed-providers.ts`) so both scripts can reuse it without
  either accidentally triggering the other's `main()`.
- `npm run db:migrate:production` (`tsx scripts/migrate.ts`, no
  `--env-file` dependency) was added because the existing `db:migrate`
  script hard-requires a `.env.local` file — which does not and should not
  exist in a real production deployment — and Node's `--env-file` flag
  throws if the file is missing.

**Verified live** end-to-end in Section 11 against a real fresh database:
refusal without env vars, refusal on a short password, successful
one-account bootstrap, refusal on re-run, Safe Mode confirmed `SAFE_MODE`,
zero demo rows confirmed.

Files added: `scripts/bootstrap-production.ts`, `scripts/seed-providers.ts`.
Files changed: `scripts/seed.ts`, `package.json`, `.env.example`.

### 4.3 Product-event ingestion secret comparison not timing-safe (FIXED)

**Finding.** `requireProductEventIngestionAuth()` compared the
`x-outreach-ingestion-secret` header to `PRODUCT_EVENT_INGESTION_SECRET`
with a plain `===`, which leaks timing information proportional to the
number of matching leading bytes — a narrow but real side channel for a
shared secret sent over the network.

**Fix.** Replaced with a length-check plus `crypto.timingSafeEqual`
constant-time comparison (`src/lib/product-events/auth.ts`). This is the
narrow hardening fix explicitly permitted by the brief ("critical
product-event auth defect"); it does not redesign the auth mechanism — the
brief separately and correctly classifies a stronger signed-message scheme
as a deferred hardening enhancement (`docs/POST_ROADMAP_BACKLOG.md`), not
something to build now.

### 4.4 No production-safe health/readiness endpoint (FIXED)

**Finding.** No health check endpoint existed anywhere, and every hosting
platform this app is realistically deployed to (Section 12) needs one to
determine when the app is ready to receive traffic.

**Fix.** Added `GET /api/health` (unauthenticated by design — a health
probe runs before an operator can log in) returning only booleans/counts/
enums: `status`, `database: REACHABLE|UNREACHABLE`, `aiProviders: {total,
configured, available}` (counts only, no keys or names beyond what's
already non-secret), `safeMode`, `buildVersion`, `latencyMs`. Never returns
a connection string, provider key, or stack trace. Added to
`middleware.ts`'s `PUBLIC_API_PATHS`. Verified live returning `200 OK` with
no session cookie (Section 11.5).

### 4.5 Node version unpinned (FIXED, narrow)

**Finding.** `package.json` had no `engines` field — nothing in the repo
constrains which Node version a deployment platform provisions, risking
silent version drift from what the app was built/tested against.

**Fix.** Added `"engines": { "node": ">=18.18.0" }` — Next.js 15's own
documented minimum, not a guess.

### 4.6 Not changed — explicitly considered and left as-is

- **Login rate limiting**: absent everywhere. Per the brief ("implement a
  minimal app-level guard only if clearly necessary and low-risk,
  otherwise document required infrastructure control"), this was
  deliberately **not** implemented in-app: initial launch scope is a small
  set of known internal users, and an in-memory limiter would give false
  confidence in a multi-instance deployment (most real hosting scales
  horizontally) without a shared store. Documented as a P1 backlog item —
  recommend infrastructure-level rate limiting (hosting/CDN/reverse proxy)
  ahead of any wider exposure. See `docs/POST_ROADMAP_BACKLOG.md`.
- **Safe Mode's code default** (`getSafeMode()` returns `"NORMAL"` when no
  row exists) was left unchanged — it is correct for local dev (the seed
  demo walkthrough launches a SIMULATED distribution plan, which Safe Mode
  would otherwise block). Production's safe default is instead guaranteed
  by the new bootstrap script, which explicitly sets `SAFE_MODE` — the
  correct place for an environment-specific default, not a global code
  change.
- **Mock AI provider UI badge**: mock output self-labels via a literal
  `"[MOCK]"` prefix baked into the returned text content, but there is no
  independent UI-chrome badge tied to the `isMock` flag. This is real but
  narrow — documented as a hardening enhancement (`docs/POST_ROADMAP_BACKLOG.md`),
  not implemented here, since it touches multiple dashboard rendering
  components for a cosmetic (not functional/safety) gap.
- **Security headers / CSP**: none are set at the app level. Left
  undocumented-in-code deliberately per the brief ("do not make
  speculative breaking CSP changes without evidence") — no evidence exists
  in this repo of what a correct CSP should allow/deny, and getting it
  wrong breaks the app. Documented as a hosting/proxy-layer requirement.
- **Dependency upgrade** (3 high `npm audit` findings, all inside Next's
  bundled `postcss`/`sharp`, fix path is a Next 16 major upgrade): not
  performed, per the brief ("do not blindly upgrade major dependencies
  unless required to close a high-risk vulnerability") — these are Next's
  internal build/image-optimization toolchain, not something this app's
  own routes expose attacker-controlled input to. Backlogged (P2).

## 5. Environment Variable Inventory

No variable below is invented — this list is exhaustive against a full
`process.env.` grep of `src/`, `scripts/`, and `drizzle.config.ts`. No
actual secret value is reproduced anywhere in this document.

| Variable | Purpose | Local dev? | Production? | Secret? | Consumer | Failure behavior when absent | Production source |
|---|---|---|---|---|---|---|---|
| `DATABASE_URL` | Postgres connection string | Required | Required | Yes | `src/lib/db/index.ts`, `scripts/migrate.ts`, `drizzle.config.ts` | Throws synchronously at import time | Hosting platform's managed Postgres connection string, injected as a protected env var |
| `SESSION_SECRET` | HS256 session-cookie signing key | Required | Required | Yes | `src/lib/auth/session.ts` | Throws synchronously on first use if unset or <16 chars | Hosting platform protected env var; generate once with `openssl rand -base64 32` |
| `SEED_OWNER_PASSWORD` | Optional override for `db:seed`'s Owner password | Optional | **Never set** | Yes (if set) | `scripts/seed.ts` | Falls back to a random password | N/A — `db:seed` now refuses to run when `NODE_ENV=production` regardless |
| `ANTHROPIC_API_KEY` | Live Anthropic Claude credential | Optional | Optional | Yes | `src/lib/ai/adapters/anthropic.ts` | Provider status `NOT_CONFIGURED`; app falls back to the mock provider | Hosting platform protected env var, from the Anthropic Console |
| `OPENAI_API_KEY` | Non-live stub credential | Optional | Optional | Yes | `src/lib/ai/adapters/openai.ts` (`hasCredentials()` only, no `execute()`) | No effect — provider stays disabled/unapproved | N/A — no live adapter exists (deliberate Phase 1 stub) |
| `GOOGLE_AI_API_KEY` | Non-live stub credential | Optional | Optional | Yes | `src/lib/ai/adapters/google.ts` (`hasCredentials()` only) | No effect | N/A — no live adapter exists |
| `PRODUCT_EVENT_INGESTION_SECRET` | Shared secret for server-to-server SecurePay ingestion | Optional | Optional | Yes | `src/lib/product-events/auth.ts` | Ingestion still works via an authenticated Owner session; unauthenticated system calls get `403` | Hosting platform protected env var, coordinated with SecurePay's integration team |
| `BOOTSTRAP_OWNER_EMAIL` | First production Owner account email (new, this review) | Not used | Required once, at bootstrap | No | `scripts/bootstrap-production.ts` | Script refuses to run | Set once by whoever runs the bootstrap; may be removed from the environment afterward |
| `BOOTSTRAP_OWNER_PASSWORD` | First production Owner account password (new, this review) | Not used | Required once, at bootstrap | Yes | `scripts/bootstrap-production.ts` | Script refuses to run; also refuses if <12 characters | Generated by the operator (e.g. a password manager); never committed; remove from the environment after first successful bootstrap |
| `NODE_ENV` | Standard Node environment flag | Automatic (`next dev` → `development`) | Automatic (`next start` → `production`) | No | `src/app/api/auth/{login,logout}/route.ts` (secure-cookie flag), `src/lib/db/index.ts` (pool caching), `scripts/seed.ts` (production guard, new this review) | N/A — Next.js sets this automatically | Automatic; no operator action needed |

## 6. Secret / Credential Readiness

- No secret is committed: `.gitignore` correctly ignores `.env`/`.env.*`
  (with an explicit `!.env.example` exception); `git log --all -- .env
  .env.local` returns nothing; a repo-wide pattern scan for API-key-shaped
  strings found zero hits.
- Every credential is read server-side only, in exactly one adapter module
  each — never sent to the browser, never logged (zero `console.*` calls
  anywhere under `src/lib/ai/`), never stored in an ordinary DB column
  (only a derived `credentialsConfigured` boolean, computed live from
  `process.env` on every read, never cached/stale).
- No production credential appears in test/demo code — `simulateProductEvent`
  forces `isDemo: true`/`source: "simulator"` unconditionally; the mock AI
  provider needs no credentials.
- **Where real credentials will live in production**: the hosting
  platform's protected environment variable store (e.g. a PaaS's secret
  env vars, or a cloud provider's secret manager wired to env vars at
  boot). No Secure Vault integration exists in this codebase and none was
  built in this review — per the brief, that is only in scope if "a clean
  existing interface already exists," and none does.

**Classification: READY.**

## 7. Database Production Readiness

- Migrations: 7 numbered, reproducible SQL files under `drizzle/`, each
  with a matching snapshot in `drizzle/meta/`, applied via Drizzle's
  standard idempotent migrator (`scripts/migrate.ts`). **Verified live in
  this review** against a completely fresh database (Section 11.1) — no
  manual/irreversible step required.
- `isDemo boolean not null default false` exists on the 13 tables that
  need it (market signals, opportunities, campaigns, audience segments,
  distribution plans, organizations, audience profiles, touchpoints,
  product journeys, conversion events, experiments, commercial learnings,
  growth recommendations). `ai_usage_records`/`model_performance`/
  `model_recommendations` correctly have no `isDemo` — a model's
  performance is never a demo concept.
- **Production must not automatically load demo data — verified true after
  this review's fix** (Section 4.2): `db:seed` refuses to run under
  `NODE_ENV=production`, and the new `db:bootstrap` seeds zero demo rows
  (verified live, Section 11.2–11.3).
- Idempotency/uniqueness: `product_events_source_idempotency_idx` UNIQUE
  `(source, idempotency_key)`; `profile_identifiers_type_value_idx` UNIQUE
  `(type, value)`; `audience_scores_segment_idx` UNIQUE
  `(audience_segment_id)`.
- Data growth / retention: see Section 13 (retention/anonymization) — no
  unbounded-growth table lacks a retention path; `ai_usage_records` and
  `audit_events` are append-only and will need an operational retention
  decision as volume grows (Section 20).

**Classification: READY.**

## 8. Demo Data Separation Audit (was the review's primary concern)

See Section 4.1 for the finding and fix. Post-fix state:

- **Aggregates** (Impact dashboard, Analytics API, ROI/efficiency, funnel):
  demo-excluded by default. Verified live.
- **Growth Director** ("What should SecurePay do next?"): demo-excluded by
  default at both generation time and read time (two independent choke
  points — `generateCandidates`/`generateAndPersistRecommendations` and
  `listCurrentRecommendations`/`whatShouldSecurePayDoNext`). Verified live.
- **Individual list rows** (campaigns list, experiments list, learnings
  list, Growth Director's persisted-but-superseded history): already
  correctly labeled with a `DEMO` badge per row before this review — that
  labeling is preserved; a demo row can still be seen explicitly by an
  operator who knows to look, it just never blends into a blended
  production number or a ranked recommendation.
- **AI cost**: intentionally never demo-filtered (see Section 4.1) — this
  is correct, not a gap, since real AI spend is real regardless of which
  campaign triggered it.

**Classification: READY** (was the review's one plausible BLOCKED
candidate; fixed and verified).

## 9. Authentication Readiness

- Password hashing: bcryptjs, cost factor 12.
- Session: `jose` HS256 JWT, 12-hour expiry, stateless (no sessions table
  — cannot be force-revoked before expiry, a known and accepted tradeoff
  of the stateless design).
- Cookies: `httpOnly: true`, `sameSite: "lax"`, `secure: NODE_ENV ===
  "production"` (automatically true under `next start`), `maxAge` matches
  session expiry.
- Logout clears the cookie and audits `LOGOUT`; does not invalidate the
  JWT itself server-side (stateless-JWT tradeoff).
- Role/active-status is re-checked from the database on **every request**
  (not just at login) via `getCurrentUser()` — a demoted or deactivated
  account loses access on its very next request, not at cookie expiry.
- `SESSION_SECRET` missing or under 16 characters throws loudly — never a
  silent insecure fallback.
- **Gap, not fixed**: no brute-force/rate-limit protection on login (see
  Section 4.6 for why this was documented rather than patched in-app).
- **Gap, not fixed**: no CSRF token; relies on `sameSite: "lax"`, which is
  an acceptable baseline for an internal tool but not a hardened posture.
- Seeded accounts: see Section 10.

**Classification: READY WITH OPERATIONAL SETUP** for the internal
controlled launch this review scopes (Section 2) — suitable as-is; login
rate limiting should be added at the infrastructure layer before any wider
deployment.

## 10. Initial User Accounts

- Production's first account is created by `npm run db:bootstrap`
  (Section 4.2) — exactly one Owner, at an email/password the operator
  supplies, no default.
- No first-login forced password reset exists in the codebase (no such
  column on `users`, no such check in the login flow) — the operator who
  runs the bootstrap is trusted to choose (or immediately rotate) a strong
  password.
- Accounts can be disabled: `users.active` is checked at login and on
  every subsequent request.
- **Gap, not fixed**: there is no in-app feature to create/disable/change
  the role of a user account — the only way to add the 5 non-Owner roles
  (Growth Director, Strategist, Content & Engagement, Distribution/Sales,
  Analyst) today is a direct database insert by the Owner, or reusing
  `scripts/seed.ts`'s account list as a one-off local-only reference (never
  run it against production). This is a genuine limitation, not a security
  hole — access remains Owner-gated — but it means onboarding additional
  production users is a manual, DB-level operation until an in-app
  account-management feature is built (`docs/POST_ROADMAP_BACKLOG.md`, P1).
- `npm run db:seed`'s 6 predictable `@dev.local` accounts cannot reach
  production: the script now refuses to run under `NODE_ENV=production`
  (Section 4.2).

**Classification: READY WITH OPERATIONAL SETUP.**

## 11. Fresh-Install Validation (performed live in this review)

A scratch PostgreSQL database (`outreach_engine_freshtest`) was created,
migrated, bootstrapped, and torn down during this review to validate the
claims above against real behavior, not documentation.

1. **Fresh migration** — `tsx scripts/migrate.ts` against the empty
   database: `Migrations complete.` with no errors.
2. **`db:seed` under `NODE_ENV=production`** — refused immediately with
   the expected message and exit code 1; created zero rows.
3. **`db:bootstrap` without env vars** — refused immediately ("must both
   be set"), exit code 1.
   **`db:bootstrap` with a short password** — refused ("must be at least
   12 characters"), exit code 1.
   **`db:bootstrap` with valid inputs** — succeeded: `Owner account
   created`, providers initialized, `Safe Mode initialized to SAFE_MODE
   (ON)`, `No demo data was seeded.`
   **`db:bootstrap` re-run** — refused ("1 OWNER account(s) already
   exist"), exit code 1; second attempt made zero writes.
4. **Direct DB verification**: `system_settings.safe_mode =
   {"mode":"SAFE_MODE"}`; `users` count = 1; `market_signals` count = 0;
   `ai_providers` shows `anthropic`/`mock` enabled (mock `NOT_CONFIGURED`→
   correctly resolves live to `AVAILABLE` with no key needed),
   `openai`/`google` disabled — exactly as designed.
5. **Live demo-separation verification** against the real (non-scratch)
   dev database, which still carries the full Phase 2–5 demo walkthrough
   plus accumulated test-suite fixtures: logged in as the seeded Owner,
   `GET /api/impact/summary` and `GET /api/analytics/impact` returned
   zeroed reach/engagement for demo-only activity by default;
   `POST /api/growth-director/recommendations` generated 12
   recommendations, every one `isDemo: false`.
6. **AI no-key state**: `GET /api/health` (unauthenticated) returned
   `aiProviders: {total:4, configured:1, available:1}` — `mock` is the one
   configured/available provider with `ANTHROPIC_API_KEY` unset locally;
   this is the exact no-key production state and the app remained fully
   functional throughout.
7. **Safe Mode / simulated distribution / product-event test**: covered by
   Phase 3–5's own extensive curl-based E2E validation (documented in
   `docs/PHASE_3_TEST_AND_VALIDATION_REPORT.md` through
   `docs/PHASE_5_TEST_AND_VALIDATION_REPORT.md`) and re-confirmed
   structurally in this review via the full automated test suite
   (Section 16) covering the same code paths — not re-walked manually a
   second time, since nothing in those code paths changed in this review
   except the demo-filtering fix, which is covered by dedicated new/updated
   tests in `tests/phase5-impact.test.ts`.

The scratch database was dropped after validation; no data was left
behind.

## 12. Deployment Readiness

| Item | Value |
|---|---|
| Runtime | Node.js, `"engines": {"node": ">=18.18.0"}` (added this review — Next.js 15's own documented minimum) |
| Package manager | npm (`package-lock.json` present, no other lockfile) |
| Build command | `next build` (`npm run build`) |
| Start command | `next start` (`npm run start`) |
| Database requirement | PostgreSQL, reachable via `DATABASE_URL` |
| Migration command (production) | `npm run db:migrate:production` (new this review — no `.env.local` dependency; production env vars come from the hosting platform directly) |
| Bootstrap command (production, once) | `npm run db:bootstrap` (new this review) |
| Persistent storage | None required — no file upload/local-write path exists anywhere in the app |
| HTTPS assumption | Implicit: session cookies only get the `Secure` flag when `NODE_ENV=production`, which `next start` sets automatically. The app does not itself redirect HTTP→HTTPS — TLS termination is a hosting/proxy-layer responsibility. |
| Containerization | No Dockerfile in the repo; `docker-compose.yml` exists but only provisions a local Postgres dev container, not the app itself. Not required — most Next.js-native hosting platforms build the app directly. |
| Health check | `GET /api/health`, unauthenticated, added this review (Section 4.4) |

**Classification: READY WITH OPERATIONAL SETUP** — a hosting platform must
be chosen (Section 12.1); nothing in the repo blocks any standard
Node/Next.js hosting target.

### 12.1 Hosting Architecture (minimum topology)

```
        USER
          │  HTTPS
          ▼
  ┌───────────────────┐
  │  Outreach Engine    │   Next.js app (build: next build,
  │  (Node.js runtime)  │   start: next start)
  └─────────┬──────────┘
            │
   ┌────────┼─────────────────┐
   ▼        ▼                 ▼
POSTGRESQL  AI PROVIDERS   SECUREPAY PRODUCT EVENTS
(managed,   (Anthropic —   (inbound HTTPS POST to
 backed up) optional,      /api/product-events,
            live if key    authenticated by shared
            supplied)      secret or Owner session)

  Not required for initial launch (future, Gates D/E):
  Google Ads · Meta Ads · messaging channels (email/WhatsApp)
```

No hosting provider is chosen here — the repo does not imply one (no
platform-specific config files exist beyond the generic
`docker-compose.yml` dev database). Any standard Node.js/Next.js hosting
platform with a managed PostgreSQL add-on satisfies these requirements.

## 13. Data Privacy / Retention

- `emailRef`/`phoneRef` are stored as SHA-256 hashes only, never raw text;
  stripped from every API response for every role except Owner via
  `sanitizeProfileForRole`, regardless of that role's `audience` scope.
- Consent (`consent_records`) is never written as a side effect of
  anything else — only an explicit API call writes it; product use is
  never treated as marketing consent anywhere in the codebase.
- Suppression is checked first, before any other rule, in both
  Next-Best-Action and retargeting eligibility — structurally unbypassable.
- Retention: a profile is only review-eligible once an explicit
  `retentionUntil` has passed — nothing is auto-eligible by age alone.
  `legalHold` always blocks anonymization, even past `retentionUntil`, and
  the block itself is audited (`PURGE_BLOCKED_LEGAL_HOLD`).
  `anonymizeProfile()` clears RESTRICTED identifiers and every
  `profile_identifiers` row while preserving lifecycle/touchpoint/
  conversion aggregates — never a silent delete.
- **No automated retention sweep exists** — `listRetentionReviewCandidates`/
  `markReviewed`/`anonymizeProfile` are on-demand functions, matching the
  documented "no scheduler infrastructure" architectural decision. An
  Owner must run retention review manually today.

**Classification: READY** for the mechanism; the absence of an automated
sweep is **NOT REQUIRED FOR INITIAL LAUNCH** (manual review is sufficient
at initial-launch data volumes) and tracked as a backlog item.

## 14. Audit Readiness

- 76 audit event types are declared (`src/lib/audit/log.ts`); 72 are
  actively written somewhere in the application. The 4 that are not
  (`ROLE_CHANGED`, `MODEL_CONFIG_CHANGED`, `EXECUTION_CANCELLED`,
  `PROFILE_LINKED`) trace to features that don't exist yet or were
  superseded by a more specific event (`PROVIDER_CONFIG_CHANGED`/
  `ROUTING_POLICY_CHANGED` supersede `MODEL_CONFIG_CHANGED`;
  `PROFILE_MERGED` supersedes `PROFILE_LINKED`) — `ROLE_CHANGED` is
  unreachable specifically because no in-app account-management feature
  exists (Section 10).
- Coverage against the brief's required list: login/security ✅,
  campaign/distribution approvals ✅, Safe Mode ✅, budgets (both
  distribution and AI) ✅, product-event ingestion ✅, profile merges ✅,
  suppression ✅, Growth Director decisions ✅, model routing ✅, retention
  actions ✅. Role/account changes: declared but currently unreachable, for
  the reason above.
- Read access: `audit` resource is `full` for Owner, `view` for Growth
  Director, `none` for every other role — matches doctrine exactly.
- Redaction is convention-enforced (a doc comment instructs callers never
  to pass secret values into `metadata`), not runtime-scrubbed. Every
  call site inspected in this review passes only structured summary
  fields (reasons, IDs, booleans, enum values) — no secret or raw payload
  was found in any audit call site.

**Classification: READY WITH CONTROLLED LIMITATION** — the 4 unreachable
event types and convention-based redaction are real but non-blocking for
initial launch; documented in `docs/POST_ROADMAP_BACKLOG.md`.

## 15. Safe Mode Readiness

- Gates the one consequential external-execution action that exists today:
  `DistributionGateway.launch()` (`assertNotSafeMode("DISTRIBUTION_EXECUTION")`,
  the only call site outside `state.ts` itself). No other high-risk
  executable action exists yet (no live outreach sends, no live paid-media
  spend), so there is no unguarded gap today.
- Toggle: Owner-only, always audited (`SAFE_MODE_CHANGED`).
- Default when no `system_settings` row exists: `NORMAL` (off). This
  default is correct for local dev (Section 4.6) and is now overridden
  safely for production by `db:bootstrap`, which explicitly sets
  `SAFE_MODE` (Section 4.2) — verified live in Section 11.

**Classification: READY WITH OPERATIONAL SETUP** — production's default is
now safe via the bootstrap script; the runbook (`docs/INITIAL_LAUNCH_RUNBOOK.md`)
instructs keeping Safe Mode ON until distribution/outreach integrations
are explicitly commissioned.

## 16. Validation Results (this review)

All run against the final state of this branch, after every fix in
Section 4:

| Check | Result |
|---|---|
| `npm run lint` | 0 errors |
| `npm run typecheck` | 0 errors |
| `npm test` | **267 passed, 7 skipped** (29 files: 27 passed, 2 conditionally skipped — same 2 pre-existing E2E files that skip without a spawned `next dev` server, unchanged since Phase 3) |
| `npm run build` | Succeeds, includes new `/api/health` route |
| Fresh DB migration | Succeeds (Section 11.1) |
| Production bootstrap | Succeeds, all 4 guard conditions verified live (Section 11.3) |
| `git diff --check` | Clean, no whitespace errors |
| Secret scan (`git log` + pattern grep) | No committed secrets found |
| `npm audit --production` | 3 high, 0 critical/moderate/low — all 3 transitive via `next`'s bundled `postcss`/`sharp`, fix path is a Next 16 major upgrade (not performed, see Section 4.6) |
| RBAC server-side enforcement | All 89 API route files checked; only the 3 correctly-unauthenticated auth routes lack a guard call |
| Demo separation | Verified live against real dev DB (Section 11.5) |
| Product-event auth/idempotency | Timing-safe comparison fixed (Section 4.3); idempotency backed by a real DB unique constraint, verified via existing test suite |
| Growth Director evidence | Existing test suite (`tests/phase5-growth-director.test.ts`) continues to pass unmodified — every recommendation's evidence remains a real, traceable object |

## 17. Readiness Scorecard

| Capability | Status | Evidence | Blocker | Owner/Action | Required for Initial Launch? |
|---|---|---|---|---|---|
| APPLICATION | READY WITH OPERATIONAL SETUP | Section 12, 16 | None | Choose hosting, set env vars | Yes |
| DATABASE | READY | Section 7, 11.1 | None | Provision managed Postgres | Yes |
| AUTH | READY WITH OPERATIONAL SETUP | Section 9 | None | None beyond deploy | Yes |
| RBAC | READY | Section 16 | None | None | Yes |
| SECRETS | READY | Section 6 | None | Configure hosting env vars | Yes |
| SAFE MODE | READY WITH OPERATIONAL SETUP | Section 15, 11.3 | None | Keep SAFE_MODE ON until integrations commissioned | Yes |
| AI | READY WITH OPERATIONAL SETUP | Section 4.6, 11.6 | None | Optional: set `ANTHROPIC_API_KEY` + AI budget policy | No (mock suffices) |
| MARKET INTELLIGENCE | READY | Phase 2, unaffected | None | None | Yes |
| CAMPAIGNS | READY | Phase 2/3, unaffected | None | None | Yes |
| TARGETING | READY | Phase 3, unaffected | None | None | Yes |
| DISTRIBUTION (simulated) | READY WITH CONTROLLED LIMITATION | Section 2 | None | None | Yes |
| DISTRIBUTION (live Google/Meta) | NOT REQUIRED FOR INITIAL LAUNCH | Section 2 | External | See `docs/ACTIVATION_PLAN.md` Gate D | No |
| COMMERCIAL MEMORY | READY | Phase 4, unaffected | None | None | Yes |
| SECUREPAY EVENTS (ingestion boundary) | READY WITH OPERATIONAL SETUP | Section 4.3 | None | Optional: coordinate shared secret with SecurePay | No (simulator suffices) |
| SECUREPAY EVENTS (live connection) | BLOCKED — EXTERNAL DEPENDENCY | `docs/SECUREPAY_EVENT_ACTIVATION.md` | SecurePay's own engineering | SecurePay must call the boundary | No |
| ATTRIBUTION | READY | Section 4.1, 8 | None | None | Yes |
| IMPACT | READY | Section 4.1, 8, 11.5 | None (was the review's one plausible BLOCKED item — fixed) | None | Yes |
| GROWTH DIRECTOR (advisory) | READY | Section 8, 11.5 | None | None | Yes |
| GROWTH DIRECTOR (autonomous execution) | NOT REQUIRED FOR INITIAL LAUNCH | Doctrine — deliberately never built | None | None | No |
| ANALYTICS API (internal) | READY | Section 4.1, 8 | None | None | Yes |
| ANALYTICS API (external auth) | DEFERRED ENHANCEMENT | ADR-007 | None | See backlog | No |
| PRIVACY | READY | Section 13 | None | None | Yes |
| RETENTION | READY WITH CONTROLLED LIMITATION | Section 13 | None | Manual review process (no scheduler) | Yes (manual) |
| AUDIT | READY WITH CONTROLLED LIMITATION | Section 14 | None | Backlog in-app account management | No |
| OBSERVABILITY | READY WITH CONTROLLED LIMITATION | Section 4.4 | None | Wire hosting log drain / error monitor | Minimal (health check) yes; full stack no |
| BACKUPS | BLOCKED — EXTERNAL DEPENDENCY | Section 18 | Hosting/managed-Postgres backup config | Configure before real data accumulates | Yes |
| DEPLOYMENT | READY WITH OPERATIONAL SETUP | Section 12 | None | Choose hosting platform | Yes |
| EXTERNAL INTEGRATIONS | NOT REQUIRED FOR INITIAL LAUNCH | Section 2 | None | See `docs/ACTIVATION_PLAN.md` Gates D/E | No |

## 18. Backups / Disaster Recovery

**Honestly classified as missing infrastructure, not pretended to exist.**
No backup/restore tooling, script, or documentation exists anywhere in
this repository (verified: `grep -ri backup docs/ scripts/` finds
nothing). This is expected — backups are a hosting/managed-database-layer
concern, not something an application repository implements — but it must
be configured before real production data accumulates. Minimum
requirements: automated daily backup of the production Postgres instance,
an explicit retention-period decision (an operator/business decision, not
invented here), periodic restore testing, encrypted storage, access
control on backup artifacts, and a documented migration rollback/forward
strategy (Drizzle migrations are forward-only by default — a rollback plan
is an operational runbook item, not a code feature).

**Classification: BLOCKED — EXTERNAL DEPENDENCY.**

## 19. Rate Limiting / Abuse

No rate limiting exists anywhere in the application (no dependency, no
hand-rolled limiter). Endpoints that would benefit most: `POST
/api/auth/login` (unauthenticated, credential-guessing surface), `POST
/api/product-events` (+ `/simulate`, reachable without a session via the
`SYSTEM_API_PATHS` middleware carve-out). See Section 4.6 for why this was
documented rather than patched in-app for this review.

**Classification: READY WITH CONTROLLED LIMITATION** for the internal
launch scope (Section 2); recommend infrastructure-level rate limiting
before wider exposure.

## 20. Post-Roadmap Backlog

See `docs/POST_ROADMAP_BACKLOG.md` for the full P0/P1/P2/P3 list. **P0 is
empty** — every P0-class gap found in this review was fixed (Section 4).

## 21. Final Classification

**OUTREACH ENGINE READY FOR INITIAL PRODUCTION ACTIVATION WITH REQUIRED SETUP**

The required setup is operational, not engineering: choose a hosting
platform, provision managed PostgreSQL with automated backups, set
`DATABASE_URL`/`SESSION_SECRET`, run `npm run db:migrate:production`, run
`npm run db:bootstrap` once, log in as the new Owner, and confirm Safe
Mode is `SAFE_MODE` (it will already be, from bootstrap). Everything else
in the initial-launch scope (Section 2) is code-complete and verified.

### Sub-classifications

- **LIVE SECUREPAY EVENT CONNECTION**: **SETUP REQUIRED** — the ingestion
  boundary is complete, secure, and idempotent; SecurePay's own
  engineering team must supply a real endpoint call and (optionally) a
  shared secret. See `docs/SECUREPAY_EVENT_ACTIVATION.md`.
- **LIVE AI**: **SETUP REQUIRED** — the Anthropic adapter is complete;
  an operator must supply `ANTHROPIC_API_KEY` and set at least one AI
  budget policy (none is seeded by default). The app is fully usable
  without this via the mock provider.
- **LIVE GOOGLE ADS**: **NOT IMPLEMENTED** — boundary-only stub, never
  falsely reports available, correctly deferred per doctrine.
- **LIVE META ADS**: **NOT IMPLEMENTED** — boundary-only stub, same as
  above.
- **LIVE DIRECT OUTREACH** (email/WhatsApp/partner platform/direct
  business outreach): **NOT IMPLEMENTED** — no adapter code exists for any
  of these channels beyond the generic SIMULATED-mode passthrough;
  correctly deferred per doctrine.

## 22. Confirmation

**NO PHASE 6 WAS CREATED.** This review produced no new roadmap phase, no
new pillar, no speculative architecture. The six-phase roadmap
(`docs/ROADMAP.md`) is unchanged and remains closed at Phase 5. All fixes
in Section 4 close real, evidence-backed production gaps within the
narrow "allowed engineering changes" scope defined for this review; no
deferred integration (live Google/Meta, live direct outreach, external
Analytics API auth, automated retention sweeps, in-app account management)
was built here — each is tracked in `docs/POST_ROADMAP_BACKLOG.md` instead.
