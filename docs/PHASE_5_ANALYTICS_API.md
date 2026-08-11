# Phase 5: Analytics API

Status: Phase 5 — implemented (internal, read-only)
Last updated: 2026-08-11

## 1. Purpose

Per ADR-007 and `docs/ARCHITECTURE.md` Section 6, Phase 5 may expose a
narrow, read-only Analytics & Insights API. It does — but scoped
conservatively per the brief's own escape hatch (Section 39: "If
implementing external access requires significant auth infrastructure:
keep it internal/read-only and document future boundary").

## 2. What Was Built

Six routes under `/api/analytics/*`, exactly the list in Section 39:

- `GET /api/analytics/campaigns` — per-campaign scorecards.
- `GET /api/analytics/channels` — per-channel scorecards (only channels
  with real reach).
- `GET /api/analytics/conversions` — conversion counts grouped by
  conversion type.
- `GET /api/analytics/impact` — impact summary + funnel + efficiency +
  ROI in one call.
- `GET /api/analytics/audiences` — lifecycle-state distribution counts.
- `GET /api/analytics/attribution` — attribution weight/touch counts
  grouped by channel + model.

**Every route is `GET`-only** — no `POST`/`PUT`/`PATCH`/`DELETE` handler
exists in any of these route files, so a mutation attempt gets Next.js's
own 405 Method Not Allowed; there is no code path by which this API can
write anything.

## 3. Authentication Boundary (Internal, Not External)

Every route reuses the exact same `requireApiCapability("view",
"analytics")` gate every other analytics read-path in this codebase
already uses — a valid authenticated session with the `analytics` view
capability, scope-filtered by role exactly as the rest of the product is
(Section 41's RBAC applies identically here; there is no separate,
weaker gate for this API).

**This is deliberately internal, not a public/external-client API.**
Building real external-client authentication (API keys, OAuth, per-client
rate limiting, a `analytics_api_clients` table) was judged to be exactly
the "significant auth infrastructure" the brief's own Section 39 says to
avoid building prematurely — so Phase 5 does not implement one. No
`analytics_api_clients` table exists. This boundary is the explicitly
documented interface for a future phase (see "Post-Roadmap Enhancements"
in the main Phase 5 doc) to extend, not a placeholder inside this API's
own code.

## 4. What Is Never Exposed

Aggregate-only, matching Section 39/40 exactly:

- No raw contact identifiers — every response is a count/sum/rate grouped
  by campaign, channel, conversion type, or lifecycle state; no route
  returns a per-profile row with a `profileId`, `emailRef`, `phoneRef`, or
  `ksNumberRef`.
- No profile-level RESTRICTED data — `/api/analytics/audiences` returns a
  `lifecycleState → count` distribution, never a profile list.
- No raw intelligence sources, doctrine, prompts, credentials, or model
  internals — this API only ever imports from `src/lib/impact/*` and
  `src/lib/attribution/*`, which have no path back to
  `src/lib/intelligence/*` raw sources or `src/lib/ai/adapters/*`.

## 5. Boundary With SecurePay's Own API

Unchanged from `docs/ARCHITECTURE.md` Section 6 / ADR-007: SecurePay's
own API handles agreements/product/money-flow capabilities; the Outreach
Engine handles commercial intelligence, campaign, targeting, memory,
conversion, and learning; this Analytics API is a third, narrow surface —
selected aggregate READ insights only. It does not merge the two
products, and it is not "SecurePay API 2.0."

## 6. Testing

Covered structurally (every route file has a `GET` export and no
mutation export — verified by direct code review, not a dedicated test
file, given there is nothing to unit-test beyond "does the RBAC gate
work," which the shared `requireApiCapability` helper already has
coverage for across the rest of the Phase 4/5 test suite) and via the
same live HTTP walkthrough documented in
`docs/PHASE_5_TEST_AND_VALIDATION_REPORT.md`.
