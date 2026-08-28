# Completion Phase 3 — Authoritative Asset Library + Plug Market Kit

## Purpose

Phase 3 turns an already-approved market release into controlled reusable material without creating a second route for new claims.

The governing chain is:

`Studio draft → Brand Guardian → authoritative sources → Brand & Claims → Compliance/Legal → Final Market Release → Asset Library → Plug Market Kit`

The Asset Library is therefore **derivative authority**. It cannot authorise content the Final Market Release did not authorise.

## Non-negotiable boundaries

1. Campaign status alone is not enough. `READY_FOR_DISTRIBUTION` without a current `market_release_record` cannot mint an asset.
2. Asset Library does not accept public headline/body/CTA copy as release input. Public content is copied from the creative variant covered by the current release proof.
3. Released asset content is immutable. Changes require a new asset version.
4. Revocation and supersession are append-only state events; history is not rewritten.
5. A market asset is currently approved for use only while:
   - its latest asset state is `RELEASED`, and
   - its exact parent `marketReleaseId` is still the campaign's current Market Release.
6. If the campaign, creative or authoritative source changes so the parent Market Release becomes stale, the asset automatically disappears from the current Plug kit.
7. Plug Market Kit requires caller-scoped SecurePay Plug authority with `canRepresentMarket=true`. Outreach never substitutes training, referral provenance or a Community profile for Plug standing.
8. The Plug projection does not expose claim sources, source references, legal/compliance notes, reviewer identities, approval decision IDs, internal campaign strategy or financial data.
9. Market Kit permission is communication permission only. It does not grant settlement, payment, referral/share, opportunity-assignment, ad-spend or distribution execution authority.

## Staff experience

`/studio/assets` is the Asset Library desk.

Owner and Growth Director can package released creative into market formats. Other Studio-authorised staff can inspect the library but cannot mint market assets.

Supported initial market formats:
- Social post
- WhatsApp message
- Poster copy
- Flyer copy
- Video script
- Talking points

This phase stores approved copy and visual direction. It does not pretend that image/video binary generation or external publishing happened.

## Plug experience

`/market-kit` shows only current safe projections and is visible in Community navigation only for SecurePay-authenticated identities.

If SecurePay market-standing authority is unavailable or says the identity cannot represent the market, the page fails closed and shows no approved assets.

Each current item is labelled **Approved for you to use** and provides a copy action for the exact approved message.

## Versioning and provenance

`market_assets` stores immutable approved content and references:
- campaign
- creative variant
- exact Market Release
- asset kind
- locale
- version
- releasing staff identity/time

`market_asset_state_events` records append-only `RELEASED`, `SUPERSEDED`, and `REVOKED` events.

A new release for the same campaign/variant/format/locale slot creates a new version and supersedes the prior current asset rather than editing it.

## Validation requirements

The regression suite must prove:
- status alone cannot mint an asset;
- current Final Market Release can mint an asset;
- released content cannot be updated in place;
- inactive/refresh-required Plug standing gets no kit;
- safe Plug projection excludes internal provenance fields;
- stale parent Market Release removes an asset from the current kit;
- migrations, lint, typecheck, tests and production build remain green.
