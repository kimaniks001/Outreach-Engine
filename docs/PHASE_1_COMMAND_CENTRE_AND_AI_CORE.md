# Phase 1: Command Centre + AI Core

Status: Phase 1 — implemented
Last updated: 2026-08-11

## 1. Purpose

Phase 1 turns the Phase 0 doctrine into the first real, usable application:
a login-protected Command Centre with role-based navigation, a working
backend/API boundary, and the AI Gateway foundation (types, provider
registry, model registry, deterministic router) with zero live provider
integrations. This document records what was built and why, so Phase 2
onward can extend it without re-deriving these decisions.

This is the application-foundation phase. It does not produce real market
intelligence, run campaigns, or call an external AI provider — see Section
10 (Non-Goals).

## 2. Reading Note: "First AI Provider Integration"

`docs/ROADMAP.md` describes Phase 1 as including "the first AI provider
integration." The Phase 1 build brief explicitly says not to call external
AI providers yet and to keep all adapters as non-live stubs. These are not
in conflict: "integration" here means introducing the AI Gateway → Model
Router → Provider Adapter *architecture* (Section 7 below) with real,
inspectable provider/model registry data — not a live API call. No network
call to Anthropic, OpenAI, or Google happens anywhere in this codebase.

## 3. Technology Stack Chosen

Per `docs/ARCHITECTURE.md` Section 4's recommendation, refined for this
phase:

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript, strict mode | `noUncheckedIndexedAccess` also enabled |
| Framework | Next.js 15 (App Router) | Single deployable for UI + API boundary — see Section 4 |
| Styling | Tailwind CSS | Utility-first, no separate design-system dependency |
| Database | PostgreSQL 16 | Via Docker locally (`docker-compose.yml`) |
| ORM | Drizzle ORM + drizzle-kit | Typed schema, SQL-shaped migrations |
| Auth | Custom session (bcryptjs + jose JWT, httpOnly cookie) | See Section 5 |
| Testing | Vitest | Unit, integration (real Postgres), and HTTP-level E2E-equivalent |
| Package manager | npm | As already recommended |

### Why Next.js 15, not 14

The Phase 0 recommendation didn't pin a Next major version. Next.js 14.2.x
carries several unpatched high-severity advisories (DoS, SSRF, cache
poisoning, RSC vulnerabilities) that are fixed only in the 15.x/16.x lines.
Next 16 requires React 19 and was released very recently at the time of this
build; jumping to it introduces compatibility risk this phase's time budget
couldn't fully validate. Next 15.5.23 (the actively-maintained security
backport line) supports React 18.2+, so the app stays on React 18 with no
other stack changes, while closing the Next-specific CVEs. See Section 11
for the residual `npm audit` findings this doesn't close and why.

### Why a single Next.js app, not a separate frontend/backend

The brief asks for "a functioning backend/API boundary" while avoiding
"unnecessary monorepo complexity" and microservices. Next.js Route Handlers
(`src/app/api/**/route.ts`) are the API boundary: they're plain HTTP
handlers, independently testable, and enforce authorization exactly like a
standalone API would (see Section 6) — without a second deployable, a second
repo, or shared-package plumbing between two projects. Server Components
call the same service-layer functions (`src/lib/**`) directly rather than
fetching their own API over HTTP, which is the idiomatic App Router pattern
and avoids a pointless network hop within one process.

## 4. Application Architecture

```
src/
  app/
    login/                     Public login page (client component)
    (dashboard)/                Auth-gated route group — layout.tsx enforces session + renders Sidebar
      today/                    TODAY
      intelligence/              INTELLIGENCE (empty state)
      campaigns/                 CAMPAIGNS (empty state)
      audiences/                 AUDIENCES (empty state)
      distribution/               DISTRIBUTION (empty state)
      engagement/                 ENGAGEMENT (empty state)
      impact/                     IMPACT (empty state)
      growth-director/             GROWTH_DIRECTOR (empty state)
      admin/                       ADMIN — sub-gated per resource, see Section 6
    api/
      auth/{login,logout,me}/     Session boundary
      admin/{providers,models,usage,audit,safe-mode}/   Admin API boundary
  lib/
    db/                          Drizzle schema + client
    auth/                        Password hashing, JWT session, current-user lookup
    rbac/                        Roles, capability grants, section access, guards
    ai/                          AI Gateway: types, adapters (stubs), registry, router, gateway, usage
    audit/                       Append-only audit log
    safe-mode/                   Centralized Safe Mode state + guard
  middleware.ts                  Edge-runtime session presence check only
scripts/
  migrate.ts, seed.ts            Local dev bootstrap (no production credentials)
tests/                           Vitest: unit, DB integration, HTTP E2E-equivalent
drizzle/                          Generated SQL migrations
```

## 5. Authentication

- **Password storage**: bcryptjs, 12 salt rounds (`src/lib/auth/password.ts`).
  No custom cryptography — an established library, per the brief.
- **Session**: a signed JWT (HS256, via `jose`) stored in an httpOnly,
  `sameSite=lax`, `secure`-in-production cookie (`outreach_session`), 12-hour
  expiry. The JWT carries only the user ID (`sub`) — role and account status
  are re-read from the database on every check (`src/lib/auth/current-user.ts`,
  memoized per request with React `cache()`), so a role change or account
  deactivation takes effect immediately rather than waiting for token expiry
  or requiring a server-side session-revocation store.
- **No sessions table**: this is a deliberate stateless-JWT choice — see
  Section 12 (Known Limitations) for the trade-off it accepts.
- **Login/logout**: `POST /api/auth/login` and `POST /api/auth/logout`
  (`src/app/api/auth/*`), plus `GET /api/auth/me`. The login page
  (`src/app/login/page.tsx`) is a client component that calls the login API
  and redirects on success.
- **Route protection**: `src/middleware.ts` runs on the Edge runtime and
  only verifies that a session cookie exists and is validly signed — no
  database access happens there (Edge runtime + `pg` don't mix). It redirects
  unauthenticated page requests to `/login` and returns 401 JSON for
  unauthenticated API requests. This is a UX convenience, **not** the
  authorization boundary — see Section 6.
- SSO, OAuth, passkeys, and MFA are explicitly not built, per the brief. The
  session design (a thin JWT abstraction, password hashing behind a single
  function) does not block adding any of them later.

## 6. RBAC Implementation

- **Roles** (`src/lib/rbac/roles.ts`): `OWNER`, `GROWTH_DIRECTOR`,
  `STRATEGIST`, `CONTENT_ENGAGEMENT`, `DISTRIBUTION_SALES`, `ANALYST` —
  exact match to `docs/ACCESS_CONTROL_MODEL.md` Section 2.
- **Capability grants** (`src/lib/rbac/permissions.ts`): a direct
  transcription of `docs/ACCESS_CONTROL_MODEL.md` Section 4's
  capability-by-resource table (`view/create/edit/approve/publish/administer`
  × `doctrine/intelligence/campaigns/content/distribution/analytics/
  audience/model-config/credentials/audit`). `can(role, capability,
  resource)` is a pure function, unit tested against the full table
  (`tests/rbac.test.ts`).
- **Section access** (`src/lib/rbac/sections.ts`): maps roles to the nine
  primary-navigation sections, matching the Phase 1 brief Section 10
  verbatim.
- **Server-side enforcement** (`src/lib/rbac/guard.ts`): `requireSection()`
  for pages (redirects to `/today` on denial, after recording an
  `ACCESS_DENIED` audit event) and `requireApiCapability()` /
  `requireOwner()` for API routes (return 401/403 JSON). Every protected page
  and every protected API route calls one of these — the UI hiding a nav
  item is a convenience, never the only check. This satisfies ADR-003.

### Growth Director's Admin access — a deliberate, doctrine-consistent extension

The brief's Section 10 lists Growth Director's pages as Today, Intelligence,
Campaigns, Audiences, Distribution, Impact, Growth Director — it does not
mention Admin. Section 10 also says: *"ADMIN should only be accessible to
OWNER initially unless Phase 0 doctrine clearly grants more."*
`docs/ACCESS_CONTROL_MODEL.md` Section 4's table **does** clearly grant
Growth Director `view` on `model-config` and `audit` (and explicitly `none`
on `credentials`, matching "no secrets by default" for this role).

This build takes that get-out clause literally: Growth Director can open
`/admin` but only sees the Providers/Models/Usage/Routing tabs (read-only —
`canManageAdminProviders()` still requires `OWNER`) and the Audit tab. Safe
Mode and all mutation endpoints require `OWNER` specifically, regardless of
capability grants — this matches `docs/AUDIT_AND_CONTROL.md` Section 4
("An Owner/Super Admin must be able to suspend...") and is not something the
Phase 0 capability table extends to any other role. This reasoning, and the
resulting behavior, is unit tested in `tests/rbac.test.ts`.

## 7. AI Gateway Architecture

```
application code
     │
     ▼
AIGateway.execute(request)        src/lib/ai/gateway.ts
     │  checks Safe Mode first (blocks everything if SAFE_MODE)
     ▼
routeTask(taskType)                src/lib/ai/router.ts
     │  pure, deterministic: highest quality_score → lowest cost → model key
     ▼
listRoutableModelsForTask()        src/lib/ai/registry.ts
     │  provider AVAILABLE + model enabled + approved + task type match
     ▼
Provider adapters (stubs only)     src/lib/ai/adapters/{anthropic,openai,google}.ts
```

- **Types** (`src/lib/ai/types.ts`): `AIProvider`, `AIModel`,
  `AIExecutionRequest`, `AIExecutionResult`, `AIProviderStatus`,
  `AIUsageRecord`, matching the brief's Section 12 vocabulary exactly.
- **Task types** (`src/lib/ai/task-types.ts`): the ten categories from
  Section 16 (`MARKET_RESEARCH` … `GROWTH_RECOMMENDATION`). No agents exist
  for any of them.
- **Provider status** (`src/lib/ai/status.ts`): `deriveProviderStatus()` is a
  pure function — `NOT_CONFIGURED` unless adapter + credentials + enabled all
  hold; `DISABLED` whenever not enabled; `DEGRADED` only via an explicit
  manual flag (no automatic health-check inference in Phase 1). Unit tested.
- **Registry** (`src/lib/ai/registry.ts`): reads provider/model rows from
  Postgres and computes `credentialsConfigured` **live** from
  `process.env` on every read (not a stale DB flag) — a provider can never
  show connected when it isn't.
- **Router** (`src/lib/ai/router.ts`): `selectModel()` is pure and
  deterministic; `routeTask()` wraps it with a live registry read. Never
  falls back to an unapproved/unavailable model — returns
  `NO_AVAILABLE_MODEL` with a human-readable reason instead.
- **Gateway** (`src/lib/ai/gateway.ts`): the single entry point. Always
  checks Safe Mode first. Records an `AIUsageRecord` and an `AI_EXECUTION`
  audit event on every call, regardless of outcome. If routing succeeds,
  since no adapter implements a live `execute()` method in Phase 1, the
  Gateway returns `NOT_IMPLEMENTED` rather than performing a call — this
  boundary is deliberate, not a bug.
- **Adapters** (`src/lib/ai/adapters/*`): one file per provider, each
  exposing only `hasCredentials()` (reads its own env var). No vendor SDK is
  imported anywhere in this codebase — see ADR-001/ADR-002.

Nothing in the application calls `AIGateway.execute()` automatically — no
scheduled job, no page load, no user action triggers it in Phase 1. It
exists as tested, working infrastructure for Phase 2 to call.

## 8. Provider & Model Registry

Seeded via `scripts/seed.ts` (idempotent — safe to re-run):

- **Providers**: `anthropic`, `openai`, `google` — `adapterImplemented:
  true` (the stub files exist), `enabled: false` by default,
  `credentialsConfigured` computed live (false unless the matching env var
  is set locally). Default displayed status: **NOT_CONFIGURED** for all
  three, exactly as the brief anticipates.
- **Models**: one placeholder model definition per provider (e.g.
  `anthropic-default`), `approved: false`, `enabled: false`,
  `approvedTaskTypes: []`. Model identifiers are deliberately generic
  placeholders, not real current model version strings — per Section 14's
  instruction not to hard-code current model names as doctrine. An Owner
  configuring real models is future Admin CRUD work (Phase 2+); Phase 1
  proves the data shape and the read/routing path against it.

## 9. Safe Mode & Audit

- **Safe Mode** (`src/lib/safe-mode/state.ts`): a single row in
  `system_settings` (`NORMAL` / `SAFE_MODE`). `getSafeMode()` /
  `setSafeMode()` are the only entry points — no other code path touches
  that table. `AIGateway.execute()` already calls `getSafeMode()` before
  every execution, proving the centralized-guard pattern the brief asks for,
  ready for Phase 2+ to reuse for outreach/publishing/paid-media once those
  exist. Changing it is Owner-only and always logged.
- **Audit** (`src/lib/audit/log.ts`): append-only `audit_events` table.
  Event types: the eight from `docs/AUDIT_AND_CONTROL.md` Section 2, plus
  `ACCESS_DENIED` (makes RBAC enforcement observable) and `AI_EXECUTION`
  (AI Gateway traceability). No update/delete helpers exist for this table.
  Visible to Owner and Growth Director (`view` grant on `audit`) via
  `/admin/audit`.

## 10. Non-Goals (confirmed not built)

Matches the brief's Section 28 list exactly: no real Market Intelligence
Agent, no crawling, no Brand Guardian execution, no Campaign Agent, no image
generation, no Holo/Meta/Google/TikTok/LinkedIn/Clay/HubSpot/n8n
integration, no social/email/WhatsApp outreach, no CRM, no commercial
memory, no audience profiling, no retargeting, no journey recovery
execution, no SecurePay product-event integration, no attribution engine, no
analytics API, no Growth Director reasoning, no model
benchmarking/self-switching, no autonomous agents, no automated ad spending.
Phase 2 has not begun.

## 11. Known Security Trade-offs

- **`npm audit`** still reports vulnerabilities transitively bundled inside
  Next.js's own internal tooling (a vendored `postcss`, and `sharp` used by
  `next/image`) and inside `drizzle-kit`'s dev-only build chain
  (`@esbuild-kit/*`). None are fixable without a Next 16 major-version jump
  or a `drizzle-kit` downgrade; both were judged higher-risk than the
  advisories themselves for this phase, since: (a) the app never processes
  untrusted CSS or images (no `next/image` remote patterns configured), and
  (b) `drizzle-kit` never runs in the deployed app, only as a local/CI dev
  command. See `docs/PHASE_1_TEST_AND_VALIDATION_REPORT.md` for the full
  audit output.
- **Stateless JWT sessions** mean a compromised or revoked session cannot be
  force-invalidated before its 12-hour expiry (deactivating the account
  still blocks access immediately, since `getCurrentUser()` re-checks
  `active` on every request — only the *token itself* can't be revoked
  early). Acceptable for an internal Phase 1 tool; a session/token-blacklist
  table is a reasonable Phase 2+ addition if needed.

## 12. Extending This in Phase 2+

- Add a real provider adapter: implement `execute()` on the relevant file in
  `src/lib/ai/adapters/`, set the matching env var, mark the provider
  `enabled` via `/admin/providers` — the registry/router/gateway need no
  changes.
- Add a new AI task type: append to `AI_TASK_TYPES` in
  `src/lib/ai/task-types.ts`.
- Add a new nav section or role: extend `SECTIONS`/`ROLES` and their access
  maps in `src/lib/rbac/` — the underlying capability model does not change
  (see ADR philosophy in `docs/ACCESS_CONTROL_MODEL.md` Section 3).
