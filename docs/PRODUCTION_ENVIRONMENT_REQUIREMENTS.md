# Production Environment Requirements

Status: Post-roadmap — **NOT Phase 6**
Companion to `docs/PRODUCTION_READINESS_REVIEW.md`
Last updated: 2026-08-11

## 1. Runtime Requirements

| Requirement | Value |
|---|---|
| Runtime | Node.js `>=18.18.0` (`package.json` `engines`, matching Next.js 15's documented minimum) |
| Package manager | npm (`package-lock.json` is the lockfile of record) |
| Framework | Next.js 15.5.23, App Router |
| Database | PostgreSQL (developed/tested against Postgres 16) |
| Build command | `npm run build` (`next build`) |
| Start command | `npm run start` (`next start`) |
| Persistent file storage | None required — no upload/local-write path exists in the app |
| Containerization | Not required. No Dockerfile ships in this repo; if the chosen hosting platform requires a container, wrap `next build`/`next start` in one — no app-specific container configuration is needed beyond that. |

## 2. Database Setup (production)

1. Provision a PostgreSQL instance with automated backups (see
   `docs/PRODUCTION_READINESS_REVIEW.md` Section 18 — this is a hosting
   decision, not something this repo configures).
2. Set `DATABASE_URL` to that instance's connection string.
3. Run `npm run db:migrate:production` (not `npm run db:migrate` — that
   variant requires a `.env.local` file, which should not exist in
   production; `db:migrate:production` reads `DATABASE_URL` directly from
   the process environment).
4. Run `npm run db:bootstrap` **once**, with `BOOTSTRAP_OWNER_EMAIL` and
   `BOOTSTRAP_OWNER_PASSWORD` set, to create the first Owner account. See
   `docs/INITIAL_LAUNCH_RUNBOOK.md` for the full step-by-step sequence.
5. **Never** run `npm run db:seed` against production — it refuses to run
   when `NODE_ENV=production`, but should also simply never be invoked
   there; it exists for local development only.

## 3. Environment Variables

See `docs/PRODUCTION_READINESS_REVIEW.md` Section 5 for the full inventory
(purpose, required/optional, secret/not, consumer, failure behavior,
production source) — reproduced here in summary form only:

**Required for production:**
- `DATABASE_URL`
- `SESSION_SECRET`

**Required once, at bootstrap only** (may be removed from the environment
after the first successful `npm run db:bootstrap` run):
- `BOOTSTRAP_OWNER_EMAIL`
- `BOOTSTRAP_OWNER_PASSWORD`

**Optional (each independently unlocks one Activation Plan gate — see
`docs/ACTIVATION_PLAN.md`):**
- `ANTHROPIC_API_KEY` (Gate C — live AI)
- `PRODUCT_EVENT_INGESTION_SECRET` (Gate B — SecurePay event connection)
- `OPENAI_API_KEY` / `GOOGLE_AI_API_KEY` — accepted but have no live
  effect (non-live Phase 1 stubs); do not set these expecting a live
  provider.

**Never set in production:**
- `SEED_OWNER_PASSWORD` — local-dev-only, and `db:seed` (the only script
  that reads it) refuses to run under `NODE_ENV=production` regardless.

**Automatic, no operator action:**
- `NODE_ENV` — set to `production` automatically by `next start`.

No value for any of these should ever appear in a committed file. Use the
hosting platform's protected/secret environment variable mechanism.

## 4. HTTPS / TLS

The app assumes TLS is terminated either by itself or, more commonly, by
the hosting platform/reverse proxy in front of it. Session cookies only
receive the `Secure` flag when `NODE_ENV=production` (automatic under
`next start`) — verify the deployment target actually serves the app over
HTTPS end to end; the app does not enforce an HTTP→HTTPS redirect itself.

## 5. Security Headers

None are set at the application level today (no `headers()` config in
`next.config.mjs`, no CSP, no HSTS, no `X-Frame-Options`). This was
deliberately not added in the production readiness review — there is no
evidence in this repository of what a correct CSP should allow, and an
incorrect one breaks the app. Configure these at the hosting/CDN/reverse-
proxy layer:

- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options` / `frame-ancestors`
- `Referrer-Policy`
- A Content-Security-Policy, once the actual production asset origins
  (fonts, any CDN) are known

## 6. Rate Limiting

None exists in the application. Configure at the hosting/CDN/reverse-proxy
layer, particularly for `POST /api/auth/login` and `POST
/api/product-events` (+ `/simulate`) — see
`docs/PRODUCTION_READINESS_REVIEW.md` Section 19.

## 7. Health Check

`GET /api/health` — unauthenticated, returns `{status, database,
aiProviders: {total, configured, available}, safeMode, buildVersion,
latencyMs}`. Point the hosting platform's readiness/liveness probe at
this path. Returns `200` when the database is reachable, `503` otherwise.
Never returns a secret, connection string, or stack trace.

## 8. Hosting Architecture (minimum topology)

See `docs/PRODUCTION_READINESS_REVIEW.md` Section 12.1 for the diagram.
In summary: `USER → HTTPS → Outreach Engine (Node/Next.js) → PostgreSQL`,
with optional outbound calls to AI providers (Anthropic, if activated) and
optional inbound calls from SecurePay's product-event system. No hosting
provider is chosen or implied by this repository.

## 9. Backups / Disaster Recovery

Not implemented in this repository (it is an application repo, not
infrastructure-as-code) — see `docs/PRODUCTION_READINESS_REVIEW.md`
Section 18 for the honest classification. Minimum requirement before real
production data accumulates: automated daily Postgres backup with a
defined retention period, periodic restore testing, and encrypted storage.
