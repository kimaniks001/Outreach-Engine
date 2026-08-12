# Activation Plan

Status: Post-roadmap — **NOT Phase 6**
Companion to `docs/PRODUCTION_READINESS_REVIEW.md`
Last updated: 2026-08-11

## Purpose

Five independent activation gates, each unlocking a distinct capability.
Gate A is required for any real use. Gates B–E are each optional and
independent — none is required to open Gate A, and opening one does not
require opening another. This mirrors the doctrine distinction between
**INITIAL LAUNCH** and **FULL EXTERNAL DISTRIBUTION ACTIVATION**
(`docs/PRODUCTION_READINESS_REVIEW.md` Section 2) — Gate A alone
constitutes initial launch; Gates D and E constitute full external
distribution activation.

---

## GATE A — Internal Production Activation (required)

Everything needed for the internal SecurePay growth team to use the
system for real, with no live external distribution or live AI required.

| Step | Status |
|---|---|
| Hosting platform selected | Operator action — repo does not require a specific one (`docs/PRODUCTION_ENVIRONMENT_REQUIREMENTS.md`) |
| Managed PostgreSQL provisioned, with automated backups configured | Operator action |
| `DATABASE_URL` / `SESSION_SECRET` set in the hosting platform's protected env vars | Operator action |
| `npm run db:migrate:production` run against the production database | Ready — verified live in this review |
| `npm run db:bootstrap` run once, with `BOOTSTRAP_OWNER_EMAIL`/`BOOTSTRAP_OWNER_PASSWORD` set | Ready — verified live in this review |
| Confirm Safe Mode is `SAFE_MODE` after bootstrap | Ready — bootstrap sets this automatically |
| Owner logs in, confirms core pages load | Ready |
| No live external distribution required | True — SIMULATED distribution is fully functional without any credential |
| Real AI optional | True — mock provider makes the app fully usable with zero AI credentials |

**Gate A is code-complete.** Nothing here is an engineering gap — every
remaining item is an operator action, documented step by step in
`docs/INITIAL_LAUNCH_RUNBOOK.md`.

---

## GATE B — SecurePay Product Event Connection (optional)

Required only to replace the local simulator with SecurePay's real product
events.

| Step | Status |
|---|---|
| Authenticated event contract already defined and stable | Ready — 10 event types, Zod-validated, see `docs/SECUREPAY_EVENT_ACTIVATION.md` |
| Production shared secret (`PRODUCT_EVENT_INGESTION_SECRET`) generated and set | Operator action, coordinated with SecurePay |
| SecurePay's endpoint configured to POST to `/api/product-events` | External — SecurePay's own engineering |
| Controlled test events sent from a non-production SecurePay account first | External — recommended before enabling for real traffic |
| Idempotency verified (duplicate event → `DUPLICATE`, zero new rows) | Ready — backed by a real DB unique constraint, already tested |
| Privacy checks: no raw email/phone stored — only server-side hashed `emailRef`/`phoneRef` | Ready — already enforced |

**Classification: SETUP REQUIRED**, blocked only on SecurePay's own
integration work. Nothing further to build on the Outreach Engine side.
Full detail: `docs/SECUREPAY_EVENT_ACTIVATION.md`.

---

## GATE C — Live AI (optional)

Required only to replace mock AI narrative with real Anthropic output.

| Step | Status |
|---|---|
| Provider key (`ANTHROPIC_API_KEY`) obtained from the Anthropic Console | Operator action |
| Key set in the hosting platform's protected env vars | Operator action |
| Provider becomes `AVAILABLE` automatically (no code change, no manual "enable" step needed — `enabledByDefault: true` is already seeded) | Ready |
| Model already approved for all 8 wired task types | Ready — seeded by both `db:seed` and `db:bootstrap` |
| AI budget configured (at least one policy — `GLOBAL`/`DAILY` or `MONTHLY` — via `POST /api/admin/ai-budget`, Owner only) | **Operator action — required.** No budget policy is seeded by default; the Gateway enforces budgets it's given, but nothing is configured out of the box. |
| Failure/fallback tested | Ready — Gateway fails closed to `NO_AVAILABLE_MODEL`/`BUDGET_EXCEEDED` on any error, never silently fabricates a response; mock remains available as an automatic, lower-priority fallback |

**Classification: SETUP REQUIRED.** The app functions correctly with this
gate closed indefinitely — the mock provider is a legitimate, permanent,
zero-cost fallback, not a placeholder awaiting removal.

---

## GATE D — Live Paid Distribution (optional, not required for initial launch)

Required only to spend real advertising money via Google Ads or Meta Ads.

| Step | Status |
|---|---|
| Adapter implementation for real launch/pause/status/spend calls | **Not built** — `google-ads.ts`/`meta-ads.ts` are boundary-only stubs today; `validateConfiguration()` always reports `NOT_CONFIGURED` and every other method throws |
| Provider developer app/account | External — Google Ads API developer token / Meta Marketing API app, neither obtained |
| OAuth or service-account credentials | External |
| Ad account ID(s) | External |
| Business account permissions / verification | External |
| Approved API scopes | External |
| Billing configured on the ad account | External |
| Sandbox/test-account validation before any real spend | External, required before Gate D can be considered even partially open |
| Budget governance re-verified against real currency (not the deterministic pseudo-spend the SIMULATED adapter uses) | Not built |
| Safe Mode confirmed `NORMAL` only when this gate is deliberately opened | Operational discipline, not a code gap |

No credential names are guessed here beyond what the code already defines
(none — no `GOOGLE_ADS_*`/`META_ADS_*` env var is read anywhere in the
codebase today). Building this gate is real, non-trivial engineering work
— explicitly **not** performed in this review, which was scoped to
production readiness of what already exists, not new integrations.

**Classification: NOT IMPLEMENTED.** Not required for initial launch.

---

## GATE E — Live Direct Outreach (optional, not required for initial launch)

Required only to send real email/WhatsApp/partner-platform/direct-business
outreach.

| Step | Status |
|---|---|
| Provider selection (e.g. an email-sending service, WhatsApp Business API) | External, not chosen anywhere in this repo |
| Consent-rule enforcement against a live send | Consent/suppression mechanism already exists (`docs/PRODUCTION_READINESS_REVIEW.md` Section 13) and would need to be wired to a real send call, which doesn't exist |
| Suppression enforcement against a live send | Same — mechanism exists, no live send call exists to wire it to |
| Rate/frequency rules for real sends | Not built — retargeting eligibility exists as a decision, never an automatic send |
| Human approval before any real send | Would need to be added — no send exists yet to approve |
| Delivery/error tracking | Not built |

No adapter code exists for `EMAIL`, `WHATSAPP`, `PARTNER_PLATFORM`, or
`DIRECT_BUSINESS_OUTREACH` beyond the generic SIMULATED-mode passthrough
every channel type already gets. This is real, non-trivial engineering
work, deliberately out of scope for this review.

**Classification: NOT IMPLEMENTED.** Not required for initial launch.
