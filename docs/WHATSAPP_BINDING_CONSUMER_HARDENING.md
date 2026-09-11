# WhatsApp binding consumer hardening

This follow-up closes consumer-side privacy races around the signed SecurePay WhatsApp binding introduced in PR #40.

## Locked invariants

1. A WhatsApp binding is communication-routing authority only. It never authenticates a person for agreement, money, release, settlement, identity-lifecycle, compliance or other protected SecurePay actions.
2. Every inbound message that enters triage must remain attached to the same SecurePay identity/binding epoch that was current when the message was accepted. A later revoke or rebind must never cause that message to be evaluated against another identity.
3. Every outbound WhatsApp item must carry the SecurePay identity/binding epoch that authorised its routing when it was queued. Dispatch must fail closed if the current binding no longer matches that exact authority snapshot.
4. Human replies must resolve the currently active WhatsApp binding for the support conversation's SecurePay identity. Historical channel addresses are not delivery authority.
5. REVOKE/rebind must not allow pending work or queued replies from the prior binding epoch to leak into the new identity relationship.
6. Legacy helpers that can write `support_channel_identities.securepay_identity_ref` without the signed assertion path are not authoritative seams and must not remain callable.

## Adversarial cases that must be covered

- A is bound, an inbound message is queued, then the address is revoked and rebound to B before triage.
- A response for A is queued, then the address is revoked/rebound before outbound dispatch.
- A staff reply is attempted from A's historical conversation after the address has moved to B.
- revoke then rebind to the same identity creates a new binding epoch; stale queued work from the old epoch must not silently dispatch.
- legacy direct-binding code cannot bypass the signed `identity-binding` endpoint.

The required behavior is fail-closed routing: preserve audit history, suppress stale work, and require a fresh authoritative binding for any new communication. Protected SecurePay actions remain on SecurePay-authenticated surfaces.