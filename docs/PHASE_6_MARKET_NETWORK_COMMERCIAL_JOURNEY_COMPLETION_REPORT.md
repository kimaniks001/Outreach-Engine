# Phase 6 — Market Network Commercial Journey Completion Report

**Status:** COMPLETE — merged after validation
**Outreach base:** `ef18171166064c1eeaf7390bf4a6e2def79e861c`  
**SecurePay backend authority:** PR #163 merged as `f3b80e05f2767f211cb40a11463f6dff0fa4479d`  
**Branch:** `phase-6-market-network-commercial-journey`

## Goal

Complete the human commercial path without allowing Outreach to manufacture identity, relationship, referral or financial truth:

**Customer asks for help → qualified ACTIVE Plug expresses interest → customer reviews privacy-safe candidates → customer selects → customer explicitly opens the relationship.**

The acceptance boundary remains:

- interest is not assignment;
- selection is not relationship;
- relationship is not referral attribution;
- relationship is not agreement authority;
- relationship is not Lifetime Share or agreement 10% authority;
- money follows the agreement, not the Outreach journey.

## Backend authority consumed

Outreach consumes the merged SecurePay Market Network contract only:

- `POST /api/v1/market-network/customer-requests`
- `GET /api/v1/market-network/customer-requests/mine`
- `GET /api/v1/market-network/customer-requests/{requestId}/candidates`
- `GET /api/v1/market-network/customer-requests/{requestId}/selection`
- `POST /api/v1/market-network/customer-requests/{requestId}/selection`
- `POST /api/v1/market-network/customer-requests/{requestId}/cancel`
- `GET /api/v1/market-network/customer-requests/{requestId}/relationship`
- `POST /api/v1/market-network/customer-requests/{requestId}/relationship`
- `GET /api/v1/market-network/plug/relationships`

The only customer request types presented are the SecurePay-owned taxonomy:

- `GENERAL_SECUREPAY_HELP`
- `PROPERTY_JOURNEY_HELP`

Outreach does not publish customer free text, phone, email, KS Number or transaction details into the market request.

## Customer journey

`My Market` is now the private commercial desk for this flow.

For each request the UI explains:

1. **What happened**
2. **What it means**
3. **What can I do next**

### OPEN

- displays SecurePay aggregate interested count;
- customer may load the current privacy-safe candidate page;
- candidates are shown as neutral `Interested Plug 1`, `Interested Plug 2`, etc.;
- no Plug identity, name, KS Number, phone or email is invented or exposed;
- customer may select one opaque `candidateRef` or cancel the request.

### SELECTED

- selection is re-read from SecurePay;
- Outreach explains that the customer choice is recorded and the opportunity is closed;
- customer must separately choose **Open this relationship**;
- no relationship is inferred from selection.

### ACTIVE relationship

- relationship is re-read from SecurePay;
- response is limited to backend-authorised relationship projection;
- `contactExchangeAvailable=false` remains closed in this slice;
- Outreach does not infer login/contact/profile data when contact exchange is unavailable.

## Plug journey

The Opportunities workspace now includes a caller-scoped **Selected relationships** section.

A Plug sees a relationship only when SecurePay returns it through `/plug/relationships` after:

1. the Plug expressed `ACCEPTED` interest;
2. the customer selected that candidate;
3. the customer explicitly opened the relationship.

The Plug relationship card does not reveal the customer's name, KS Number, phone, email or private identity data.

## Session and proxy boundary

The existing SecurePay Market Network bearer bridge remains the only authentication path.

Browser code calls same-origin Outreach API routes. Server routes resolve the request-scoped SecurePay session and call SecurePay with its bearer token. The bearer token is not returned to the browser.

No local Outreach table stores authoritative customer requests, selections or relationships.

## Mutation safety

- Customer request creation requires an `Idempotency-Key`.
- The browser retains the same generated key across a failed create attempt and discards it only after successful backend creation.
- Selection submits only `{ candidateRef }`.
- Relationship POST submits no Plug id, KS Number, contact detail or other body.
- After successful mutations the UI re-reads backend request truth.
- `404`/`409` mutation failures trigger a refresh attempt rather than a locally invented state transition.

## Financial and referral isolation

The product repeatedly states that request, interest, selection and relationship do not create:

- referral provenance;
- Lifetime Share;
- agreement-level 10%;
- a fee;
- an agreement;
- Payment Ready;
- payment;
- release;
- settlement;
- ledger authority.

Locked rule remains:

> **No Plug KS Number written into the agreement = no agreement 10% share.**

The existing My Market referral/reward evidence sections remain separate from the new help-request journey.

## Tests added

`tests/market-network-commercial-journey.test.ts` locks the key Phase 6 boundaries:

- exactly two SecurePay-owned request types;
- interest / selection / relationship separation;
- relationship does not create referral or 10% authority;
- contact remains fail-closed;
- create request forwards only taxonomy + idempotency evidence;
- selection forwards only opaque `candidateRef`;
- relationship open sends no body;
- SecurePay HTTP conflict status is preserved so the UI can refresh backend truth.

## Validation gate

The existing `Outreach validation` workflow is the execution gate for this phase and already covers the changed Market Network paths plus `tests/market-*.test.ts`.

Required before merge:

- PostgreSQL migration/seed
- `npm run lint`
- `npm run typecheck`
- `npm test -- --reporter=verbose`
- `npm run build`
- review threads resolved
- human merge decision

The Phase 6 PR validation completed successfully before merge. The subsequent
UI completion slice added safe post-create refresh handling, relationship
conflict rehydration and candidate pagination beyond the first 50 results.

## Explicitly deferred

Phase 6 does **not** implement:

- pre-selection public Plug profile disclosure beyond the existing opaque candidate projection;
- customer/Plug phone or email handoff;
- bilateral contact consent/revocation;
- relationship completion/termination/reselection lifecycle;
- Master or territory assignment;
- agreement Plug attribution;
- Lifetime 10% calculation or entitlement display.

Those remain separate authority decisions. Agreement attribution and agreement-level 10% belong to Phase 7.
