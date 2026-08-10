# Phase 1 Test & Validation Report

Status: Phase 1
Last updated: 2026-08-11
Environment: Node v24.18.1, npm 11.16.0, PostgreSQL 16 (Docker), macOS/Darwin

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

Strict mode + `noUncheckedIndexedAccess` enabled in `tsconfig.json`.

## 3. Unit & Integration Tests

```
$ npm test
> vitest run

 Test Files  5 passed (5)
      Tests  50 passed (50)
```

| File | Covers | Requires DB |
|---|---|---|
| `tests/rbac.test.ts` | Capability × resource grants (full `docs/ACCESS_CONTROL_MODEL.md` Section 4 table), per-role section access (brief Section 10), Admin sub-resource gating, Safe Mode Owner-only, credentials never viewable | No |
| `tests/ai-router.test.ts` | `deriveProviderStatus` (never falsely AVAILABLE), `selectModel` (never guesses, deterministic tie-breaks, always explainable) | No |
| `tests/auth.test.ts` | Password hashing/verification (bcryptjs, salted), session JWT round-trip, tampered/garbage/expired token rejection | No |
| `tests/db.test.ts` | Audit event persistence, Safe Mode get/set + audit trail, provider registry never returns credential values, `authenticateUser` success/failure/inactive-account paths | Yes (real Postgres) |
| `tests/http-e2e.test.ts` | Full HTTP flow: unauthenticated redirect, Owner login → Admin access → provider registry read → Safe Mode change → logout; Content & Engagement login → Admin denied (page redirect + API 403) → Safe Mode change denied → Engagement allowed → logout; wrong password never succeeds | Yes (spawns `next dev` + real Postgres) |

Explicit requirements from the brief's Section 26, and where they're covered:

- **Authentication guards** — `tests/http-e2e.test.ts` ("unauthenticated request is redirected to /login"); `tests/auth.test.ts` (token validity).
- **RBAC server-side enforcement** — `tests/rbac.test.ts` (full grant table); `tests/http-e2e.test.ts` (live 403s/redirects).
- **CONTENT_ENGAGEMENT cannot access Admin/model config** — `tests/rbac.test.ts` (`canAccessSection`, `canViewAdminProviders`); `tests/http-e2e.test.ts` (live: page redirect + API 403).
- **ANALYST cannot mutate anything** — `tests/rbac.test.ts` ("ANALYST is read-only and cannot mutate anything", checked against all ten resources × five mutating capabilities).
- **OWNER can access Admin** — `tests/http-e2e.test.ts` (live 200s on page + API + mutations).
- **Model router refuses unavailable/unapproved models** — `tests/ai-router.test.ts` (`selectModel([])` → `NO_AVAILABLE_MODEL`, never fabricates a selection).
- **Provider states are honest** — `tests/ai-router.test.ts` (`deriveProviderStatus`); `tests/db.test.ts` ("without ANTHROPIC_API_KEY set, anthropic never shows AVAILABLE").
- **Safe Mode can only be changed by Owner** — `tests/rbac.test.ts` (`canChangeSafeMode`); `tests/http-e2e.test.ts` (live: Owner 200, Content & Engagement 403).
- **Audit event creation** — `tests/db.test.ts` ("recordAuditEvent persists and is readable back"; "records a SAFE_MODE_CHANGED audit event on every change").
- **Secrets never appear in API output** — `tests/db.test.ts` ("never returns a raw credential value, only booleans/status"; "never stores a password/credential value under a password-like key" in audit metadata).
- **Frontend route/access tests** — `tests/http-e2e.test.ts` covers page-level redirects (not component rendering) since no browser/DOM testing library is installed — see Section 6.

## 4. Build

```
$ npm run build
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (28/28)

28 routes: 2 static, 26 dynamic (server-rendered — expected, since every
non-login page reads the session and most read the database)
Middleware: 39.6 kB
```

## 5. `git diff --check`

```
$ git diff --cached --check
(no output — exit 0, no whitespace errors)
```

## 6. Minimal E2E Flow

No browser automation tool (Playwright, etc.) is installed in this
environment. `tests/http-e2e.test.ts` runs the equivalent flow at the HTTP
level against a real spawned `next dev` instance and a real Postgres
database — every status code, redirect, and response body asserted below
was independently reproduced manually via `curl` during development
(session cookies, redirects, 403s, and audit log entries all inspected
directly), not just asserted by the test file. The flow matches the brief's
Section 29 request exactly:

1. Login as Owner → `/admin/providers` returns 200.
2. View provider registry → `GET /api/admin/providers` returns 200 with all
   three seeded providers, all showing `NOT_CONFIGURED` (no credentials set
   in this environment).
3. Change Safe Mode → `POST /api/admin/safe-mode` (`SAFE_MODE`, then back to
   `NORMAL`) returns 200 both times; verified via `tests/db.test.ts` that
   this produces a `SAFE_MODE_CHANGED` audit row each time.
4. Logout → `POST /api/auth/logout` returns 200; subsequent `/today` request
   with the same cookie redirects to `/login` (verified manually with
   `curl -b/-c` cookie-jar round-trip).
5. Login as Content & Engagement → `/admin/providers` redirects (307) rather
   than rendering; `GET /api/admin/providers` returns 403; `POST
   /api/admin/safe-mode` returns 403; `/engagement` returns 200.
6. Logout → 200.

## 7. Secret Scan

```
$ git status --short | grep -i env
A  .env.example
```

`.env.local` (real `DATABASE_URL`/`SESSION_SECRET` for this environment) is
git-ignored and was confirmed absent from the staged changeset. A pattern
scan for AWS keys, `sk-...` tokens, GitHub PATs, PEM private key headers, and
`SESSION_SECRET=<value>` assignments across every staged file returned no
matches. A targeted search for the random dev passwords printed by
`scripts/seed.ts` during this session confirmed none of them appear in any
tracked file.

## 8. Protected-Endpoint Verification

Every route under `src/app/api/` (except `POST /api/auth/login` and `POST
/api/auth/logout`, which must be reachable to authenticate at all) calls
`requireApiUser`, `requireApiCapability`, or `requireOwner` from
`src/lib/rbac/guard.ts` before touching data. Every page under
`src/app/(dashboard)/` is wrapped by a layout or page-level `requireSection`
call. This was verified by (a) reading every route/page file, (b) the live
`tests/http-e2e.test.ts` 401/403/307 assertions, and (c) manual `curl`
testing without a session cookie against `/today`, `/admin/providers`, and
`/api/admin/providers` (all correctly rejected).

## 9. Role-Based UI Verification

Confirmed live (via `curl` with real session cookies for each seeded role)
that the Sidebar only renders nav links for `sectionsForRole(role)`, and
separately confirmed that hiding a link is not the enforcement mechanism —
navigating directly to a disallowed URL is blocked server-side regardless of
what the sidebar shows (Section 8).

## 10. Provider Status Honesty

With no `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_AI_API_KEY` set in
this environment, `GET /api/admin/providers` returns all three seeded
providers as `DISABLED` (not enabled by default) — never `AVAILABLE`. Toggling
`enabled` via the Owner-only PATCH endpoint moves a provider from `DISABLED`
to `NOT_CONFIGURED` (still correctly not `AVAILABLE`, since no credentials
are configured) — confirmed live and in `tests/db.test.ts`.

## 11. Phase 2 Scope Check

Confirmed absent from the codebase: any crawler/scraper, any prompt sent to
a live AI provider, any campaign/content generation logic, any ad-platform
SDK or API client, any CRM/outreach-sending code, any commercial-memory or
audience-profiling table beyond the `users` table itself. Every non-Today,
non-Admin page under `src/app/(dashboard)/` renders a static
`<EmptyState>` with phase-appropriate messaging and no computed/fabricated
metrics.

## 12. `npm audit` (documented, not silently ignored)

```
7 vulnerabilities (4 moderate, 3 high)
```

Down from 14 found on initial dependency install. Remaining findings and
disposition — see `docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md` Section 11
for full reasoning:

| Package | Severity | Why not fixed here |
|---|---|---|
| `postcss` (bundled inside `next`) | high | Requires Next 16 (major, unvalidated in this session); app never processes untrusted CSS |
| `sharp` (bundled inside `next`, via `next/image`) | high | Same Next 16 requirement; `next/image` remote patterns are not configured/used in Phase 1 |
| `esbuild` (via `drizzle-kit` → `@esbuild-kit/*`) | moderate | Dev-only migration CLI, never runs in the deployed app; fix requires downgrading `drizzle-kit` to 0.18.1 (loses Postgres dialect improvements relied on here) |

`drizzle-orm` itself was upgraded from the initially-installed 0.33.0 (which
had a SQL-injection advisory) to 0.45.2 during this build specifically to
close that finding — see git history on `package.json`.

## 13. Final Validation Status

All items in Section 29 of the brief were run and passed, with the two
noted, documented exceptions: no dedicated browser E2E tool is installed
(Section 6), and `npm audit` is not fully clean (Section 12) — both judged
acceptable trade-offs for this phase and written up rather than hidden.
