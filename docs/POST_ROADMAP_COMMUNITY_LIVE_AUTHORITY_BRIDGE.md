# Community LIVE authority bridge

Status: post-roadmap foundation

## Purpose

Community LIVE is the human community experience inside Outreach. It is not a second Community authority.

SecurePayAPI MW-07 is the intended backend authority for Community discovery, membership, moderator/organiser authority, join requests, and published Community feed visibility. Outreach consumes that authority and presents it in a warmer, role-aware experience.

## Locked boundaries

1. SecurePayAPI remains authoritative for Community membership and feed visibility.
2. Outreach must never manufacture ORGANISER or MODERATOR authority from UI state, persona/lens selection, training level, accolades, Plug status, Master status, staff role, or local demo data.
3. A PRIVATE Community must not be enumerable to a non-member. Treat backend 404 as not found; never translate it into a revealing “private community exists” message.
4. Public Community discovery contains only backend-authorised discoverable Communities.
5. Community feed publication is deliberate. Outreach must never auto-publish payment, agreement, Payment Ready, settlement, ledger, dispute, referral, earnings, or other private financial events into Community LIVE.
6. Community membership is not endorsement, reputation, verification, creditworthiness, financial strength, platform authority, or a Master credential.
7. Community LIVE never displays a Plug’s Lifetime 10% Share or personal earnings. Those remain private economic surfaces backed by SecurePay financial truth.
8. A caller’s SecurePay bearer token must be propagated to SecurePayAPI. Do not use a shared Outreach service token to impersonate members.

## Existing SecurePayAPI contract used by Outreach

The current MW-07 implementation is in SecurePayAPI PR #148 (`mw-07-community-membership-feed-authority`). It provides, among other routes:

- `GET /communities`
- `GET /communities/me`
- `GET /communities/{communityId}`
- `GET /communities/{communityId}/members`
- `GET /communities/{communityId}/feed`
- `POST /communities/{communityId}/feed`
- `POST /communities/{communityId}/feed/{postId}/unpublish`
- `POST /communities/{communityId}/join`
- `POST /communities/{communityId}/join-requests`
- approve/reject join-request routes
- `POST /communities/{communityId}/leave`

Membership roles are backend-owned `MEMBER`, `MODERATOR`, and `ORGANISER`. Feed visibility is `PUBLIC` or `MEMBER`.

## Identity bridge

Outreach currently has its own internal staff session. Plugs and Masters should not receive a second independent password identity merely to use Community LIVE.

The intended next identity slice is a SecurePay identity/session bridge that gives Outreach a caller-scoped SecurePay access token associated with the authenticated KS identity. The Community authority adapter added in this slice therefore requires an explicit caller bearer token and has no fallback service credential.

Until that identity bridge is implemented, Community LIVE remains in prototype/demo presentation mode even though the backend authority contract is typed and ready.

## Circles and Masters

MW-07 explicitly does not implement Circles or Masters. Outreach must therefore keep current Circle and Master interactions labelled as prototype/demo rather than persisting a competing authority model.

Future work should connect:

- Circles to the eventual MW-08 backend authority;
- Opportunities to MW-09 where relevant;
- Master status/stewardship to MW-10 backend authority.

A Circle remains a deliberate smaller relationship space and must not be silently modelled as a Community.

## Failure behaviour

The adapter preserves backend privacy semantics:

- 401 → unauthenticated
- 403 → authenticated but not authorised
- 404 → not found, including privacy-preserving non-enumeration
- 409 → state conflict
- 422 → invalid transition/policy

UI copy may humanise these outcomes but must not reveal more information than the backend response permits.
