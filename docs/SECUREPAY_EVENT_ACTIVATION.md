# SecurePay Product Event Activation

Status: Post-roadmap — **NOT Phase 6**
Companion to `docs/PRODUCTION_READINESS_REVIEW.md` (Gate B)
Last updated: 2026-08-11

This document separates two distinct bodies of work: what the **Outreach
Engine** already provides (nothing further to build), and what
**SecurePay's own API/engineering team** must do to connect to it. **No
change was made in the SecurePay API repository as part of this review —
that repository was not touched.**

## 1. What the Outreach Engine Already Provides (no further work needed)

A single, stable, authenticated, idempotent ingestion boundary:
`POST /api/product-events`, implemented by
`src/lib/product-events/ingest.ts` and fronted by
`src/lib/product-events/auth.ts`.

### Authentication (either is sufficient)

1. **Shared-secret header** — `x-outreach-ingestion-secret`, compared
   against the `PRODUCT_EVENT_INGESTION_SECRET` environment variable using
   a constant-time comparison (`crypto.timingSafeEqual`, fixed in this
   review — see `docs/PRODUCTION_READINESS_REVIEW.md` Section 4.3). This
   is the path a real SecurePay-to-Outreach-Engine server-to-server
   integration should use.
2. **Authenticated Owner session** — for manual/UI-driven ingestion; not
   relevant to a real SecurePay integration.

No credential is required to complete this boundary — with
`PRODUCT_EVENT_INGESTION_SECRET` unset, the endpoint simply requires an
Owner session instead. Every unauthenticated request gets `403 FORBIDDEN`
under any configuration.

### Request contract

| Field | Type | Required | Notes |
|---|---|---|---|
| `source` | string, 1–64 chars | Yes | Identifies the calling system, e.g. `"securepay"` |
| `externalEventId` | string, 1–128 chars | Yes | SecurePay's own event identifier |
| `idempotencyKey` | string, 1–160 chars | No | Defaults to `${source}:${externalEventId}` if omitted |
| `productEventType` | enum (see Section 2) | Yes | |
| `occurredAt` | ISO-8601 datetime string | Yes | |
| `schemaVersion` | string | No | Defaults to `"1"` |
| `profileRef` | object | Yes | At least one of: `profileId` (uuid), `ksNumber`, `email`, `phone`, `sessionToken`, `campaignClickRef`, `partnerRef` |
| `organizationId` | uuid | No | |
| `campaignId` | uuid | No | Attaches the event to a specific Outreach Engine campaign, when known |
| `metadata` | flat object | No | ≤20 keys, each value ≤500 chars, no nesting/arrays — cannot carry sensitive free-form data |
| `isDemo` | boolean | No | Defaults `false`. **SecurePay's real integration must never set this to `true`** — that flag exists for the local-dev simulator only. A real event that carries `isDemo: true` would be silently excluded from every production Impact/Analytics/Growth Director figure (see `docs/PRODUCTION_READINESS_REVIEW.md` Section 4.1) — which is correct behavior, but means a mistaken `true` would make real activity invisible, not visible-but-wrong. |

**No monetary value field exists in this contract.** Product events never
carry an amount — `value` on the internal conversion-events record is
populated only by internal code paths, not via this ingestion boundary.
If SecurePay needs to convey a monetary figure for Impact/ROI purposes in
the future, that is new work, not something to route through this
contract as-is.

### Supported event types (exhaustive — do not send any type not on this list)

From `productEventTypeEnum` in `src/lib/db/schema.ts`:

`KSNUMBER_CREATED`, `SECURELINK_DRAFT_STARTED`, `SECURELINK_CREATED`,
`KEYCONTRACT_CREATED`, `GROUP_SECURELINK_CREATED`, `SECUREFLOW_CREATED`,
`PAYMENT_COMMITTED`, `AGREEMENT_COMPLETED`, `SETTLEMENT_COMPLETED`,
`PRODUCT_REUSED`.

No other event type is invented or implied here. If SecurePay needs to
convey an event that doesn't map to one of these 10, that is new
engineering work on the Outreach Engine side (a schema/migration change),
not something this document can satisfy retroactively.

### Idempotency, validation, auditing

- Unique constraint on `(source, idempotency_key)` — a duplicate send
  returns `{status: "DUPLICATE", productEventId}` with HTTP `200`, creates
  zero new rows, and is audited (`PRODUCT_EVENT_DUPLICATE`).
- Malformed input (fails Zod validation) returns `{status: "REJECTED",
  errors}`, mutates nothing except an audit row (`PRODUCT_EVENT_REJECTED`).
- Every accepted event is audited (`PRODUCT_EVENT_INGESTED`). No raw
  request body is ever logged; the parsed, validated `metadata` is stored
  in the `product_events.payload` column by design (not a log leak).

## 2. What SecurePay's Own Team Must Do

This is entirely outside the Outreach Engine repository:

1. Decide which of the 10 supported event types SecurePay's system should
   emit, and at which point in its own flow.
2. Implement an outbound HTTPS POST from SecurePay's system to the
   Outreach Engine's `/api/product-events` endpoint, populating the
   contract in Section 1.
3. Obtain (or have provisioned) the `PRODUCT_EVENT_INGESTION_SECRET` value
   set in the Outreach Engine's production environment, and send it as the
   `x-outreach-ingestion-secret` header on every request.
4. Generate a stable `externalEventId` per real SecurePay event so the
   idempotency contract is meaningful (retries on SecurePay's side should
   reuse the same ID, not generate a new one).
5. Send a small number of controlled test events from a non-production
   SecurePay account first, and verify in the Outreach Engine's audit log
   (`PRODUCT_EVENT_INGESTED`) and Impact dashboard that they arrive
   correctly attributed and are **not** marked `isDemo: true`.
6. Only after controlled test events are verified, enable the integration
   for real production traffic.

**No changes were made to the SecurePay API repository in this review**
— that decision and implementation belong entirely to SecurePay's own
engineering team, on their own timeline.

## 3. Classification

**LIVE SECUREPAY EVENT CONNECTION: SETUP REQUIRED.** The Outreach Engine
side of this integration is complete, secure, and verified. Nothing
remains to build here — only SecurePay's own outbound integration work and
a shared-secret exchange.
