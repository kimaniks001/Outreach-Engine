# Phase 4: SecurePay Product Event Integration

Status: Phase 4 — implemented
Last updated: 2026-08-11

## 1. Purpose

Defines the inbound boundary that lets SecurePay product activity update
commercial memory without tightly coupling the Outreach Engine to
SecurePay internals — Phase 4 brief Section 13.

```
SECUREPAY
   → PRODUCT EVENT ADAPTER / INGESTION API   (src/app/api/product-events/route.ts)
   → EVENT VALIDATION                         (src/lib/product-events/schemas.ts)
   → DEDUPLICATION / IDEMPOTENCY               (product_events unique index)
   → PROFILE / JOURNEY UPDATE                  (identity + journeys)
   → ATTRIBUTION                               (src/lib/attribution)
   → NEXT-BEST-ACTION                          (src/lib/next-best-action/engine.ts)
```

`src/lib/product-events/ingest.ts::ingestProductEvent()` is the single
orchestration entry point for this entire flow — the authenticated API
route and the deterministic simulator both call it; no other code path is
permitted to create touchpoints/journeys/conversions from a product event.

## 2. Supported Event Types

Exactly the Section 13 list, matching `productEventTypeEnum` in
`src/lib/db/schema.ts`: `KSNUMBER_CREATED`, `SECURELINK_DRAFT_STARTED`,
`SECURELINK_CREATED`, `KEYCONTRACT_CREATED`, `GROUP_SECURELINK_CREATED`,
`SECUREFLOW_CREATED`, `PAYMENT_COMMITTED`, `AGREEMENT_COMPLETED`,
`SETTLEMENT_COMPLETED`, `PRODUCT_REUSED`. No SecurePay financial state
beyond this known doctrine is invented.

## 3. Request Schema

`src/lib/product-events/schemas.ts` (Zod, strict):

```
{
  source: string                     // e.g. "securepay", "simulator"
  externalEventId: string
  idempotencyKey?: string            // defaults to "source:externalEventId"
  productEventType: <one of the 10 above>
  occurredAt: ISO-8601 datetime
  schemaVersion?: string             // default "1"
  profileRef: {                      // at least one required
    profileId?: uuid
    ksNumber?: string
    email?: string
    phone?: string
    sessionToken?: string
    campaignClickRef?: string
    partnerRef?: string
  }
  organizationId?: uuid              // must reference an existing organization
  campaignId?: uuid
  metadata?: Record<string, string|number|boolean>  // ≤20 keys, no nesting
  isDemo?: boolean
}
```

`metadata` is capped to a shallow string/number/boolean map — no nested
objects, no arrays — so no arbitrary free-form or sensitive payload can be
smuggled through it (Section 12/14's "no arbitrary free-form sensitive
data" constraint, enforced at the schema level, not by convention).

Malformed input is rejected outright — `{ status: "REJECTED", errors }` —
and **never mutates anything**: no profile is touched, no row is written
except an audit event (`PRODUCT_EVENT_REJECTED`), verified in
`tests/phase4-product-events.test.ts`.

## 4. Authentication

`src/lib/product-events/auth.ts::requireProductEventIngestionAuth()`.
Either credential is sufficient — no live SecurePay API credentials are
required to complete Phase 4:

1. **Shared secret header** — `x-outreach-ingestion-secret` checked
   against `PRODUCT_EVENT_INGESTION_SECRET` (optional env var, unset by
   default). For a real server-to-server SecurePay integration, which has
   no browser session.
2. **Authenticated OWNER session** — same "only Owner writes commercial
   memory" precedent Phase 3 established for `audience`/`distribution`.
   Lets an Owner drive ingestion from the demo simulator with zero secret
   configured.

No public unauthenticated ingestion under any configuration — a request
with neither credential gets `403 FORBIDDEN` (never a fabricated success).

**Middleware carve-out**: `src/middleware.ts`'s edge-runtime session check
normally 401s any `/api/*` request lacking a session cookie before it ever
reaches a route handler — which would make the shared-secret path
unreachable for a real system-to-system caller with no cookie at all.
`/api/product-events` is added to a narrow `SYSTEM_API_PATHS` exemption so
the request reaches the route handler, where
`requireProductEventIngestionAuth()` performs the real check described
above. This is not a broader public-API exemption — every other `/api/*`
route is unaffected, and an unauthenticated, no-secret request to
`/api/product-events` itself is still rejected with 403 by the route, not
silently allowed through.

## 5. Idempotency

Critical, per Section 38. `product_events` has a unique index on
`(source, idempotency_key)`. Every ingestion checks for an existing row
with that key **before** any profile/touchpoint/journey/conversion
mutation. A duplicate:

- Creates **zero** new rows anywhere.
- Returns `{ status: "DUPLICATE", productEventId: <existing id> }`
  (HTTP 200, not an error).
- Records a `PRODUCT_EVENT_DUPLICATE` audit event.

Verified in `tests/phase4-product-events.test.ts` (both the default
`source:externalEventId` key and an explicit `idempotencyKey`) and live
over HTTP during validation (Section T of the completion report).

## 6. Profile Resolution

Every event resolves (or creates) exactly one canonical profile via
`src/lib/commercial-memory/identity.ts::resolveProfile()` — deterministic,
exact-identifier matching only. See
`docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md` Section 7 for the
full identity-resolution design. An event with zero resolvable identifiers
in `profileRef` is rejected by the schema (`profileRef` requires ≥1
field) — there is no path to an unaddressable profile.

## 7. Downstream Effects

Per event type, `ingestProductEvent()`:

1. Records exactly one `touchpoints` row (type mapped 1:1 from the
   product event type).
2. Starts/advances/completes a `product_journeys` row for the four
   journey-shaped event types (`SECURELINK_DRAFT_STARTED`/`_CREATED`,
   `KEYCONTRACT_CREATED`, `GROUP_SECURELINK_CREATED`,
   `SECUREFLOW_CREATED`) — a `*_CREATED` event with no open journey found
   starts and immediately completes a fresh one, so the journey record
   always exists even if the draft-started event never arrived.
3. Records a `conversion_events` row where applicable — "first" types
   (`KSNUMBER_CREATED`, `FIRST_SECURELINK`, `FIRST_KEYCONTRACT`,
   `FIRST_GROUP_SECURELINK`, `FIRST_SECUREFLOW`) are deduplicated per
   profile; a repeat product-created event instead records a
   `PRODUCT_REUSED` touchpoint + `REPEAT_USE` conversion.
4. Computes and persists multi-touch attribution for any conversion
   created (`src/lib/attribution/conversions.ts`).
5. Recomputes lifecycle state (`recomputeLifecycle()`, invoked inside
   `recordTouchpoint()`).
6. Recomputes next-best-action (`recomputeNextBestAction()`, deterministic
   only — no AI narrative by default in the ingestion path).
7. Marks the `product_events` row `PROCESSED` and records a
   `PRODUCT_EVENT_INGESTED` audit event.

## 8. Deterministic Simulator

`src/lib/product-events/simulator.ts` — proves the complete flow above
with zero live SecurePay integration (Section 31). Every event it
produces is forced `isDemo: true`, `source: "simulator"`. Never presented
as real product activity anywhere in the UI.
`simulateElapsedTime(hoursElapsed)` demonstrates abandonment detection
without a real wait by sweeping `src/lib/journeys/abandonment.ts` against
a shifted `now`, never mutating a stored timestamp.

## 9. Security Notes

- Schema validation happens before any database write.
- Idempotency check happens before any profile/touchpoint mutation.
- `metadata` cannot carry nested/arbitrary data (shallow-map schema).
- No credentials are required to complete Phase 4 locally — the shared
  secret is optional and unset by default; the Owner-session path covers
  every demo/test scenario.
- Every ingestion outcome (processed, duplicate, rejected) is audited.
