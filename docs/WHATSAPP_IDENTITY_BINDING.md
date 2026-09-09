# WhatsApp identity binding authority contract

Outreach never discovers or proves a SecurePay identity from a WhatsApp phone number.

A WhatsApp address may become identity-bound only when SecurePay emits an assertion about a contact relationship that SecurePay has already verified using its own authoritative identity/contact controls.

## Consumer endpoint

`POST /api/internal/support/whatsapp/identity-binding`

Required deployment configuration:

- `SECUREPAY_CHANNEL_BINDING_SECRET` — a dedicated 32+ byte HMAC secret, separate from worker and product-event secrets.
- `X-SecurePay-Signature-256: sha256=<hex-hmac>` — HMAC-SHA256 over the exact raw JSON request body.

The request body is intentionally strict:

```json
{
  "assertionId": "contact-event-unique-id",
  "channel": "WHATSAPP",
  "channelAddress": "+254712345678",
  "securepayIdentityRef": "KS001ABC",
  "action": "BIND",
  "authoritySequence": 42,
  "occurredAt": "2026-09-09T15:30:00+03:00"
}
```

No password, OTP, identity document, account balance, agreement data or other customer payload belongs in this contract.

## Safety rules

- Assertion IDs are idempotent.
- Authority sequence is monotonic per WhatsApp address; stale/out-of-order assertions are historical only.
- An active address cannot silently move to another SecurePay identity. SecurePay must explicitly `REVOKE` the old binding before a later `BIND` can attach a different identity.
- `REVOKE` removes the current Outreach mapping but does not delete the append-only assertion audit trail.
- A successful `BIND` wakes any `WAITING_IDENTITY` inbound messages and attaches them to the existing one-conversation-per-SecurePay-identity support spine.
- Every original inbound WhatsApp message remains individually persisted for audit.
- These assertions create communication routing only. They grant no SecurePay agreement, payment, release, settlement, identity-lifecycle or compliance authority.

## Producer rule

Do not emit these assertions from phone possession alone and do not build a reverse phone-number lookup in Outreach.

The SecurePayAPI producer must be attached only to a contact-verification event that is already authoritative inside SecurePay. If that authoritative producer seam does not exist yet, leave numbers in `WAITING_IDENTITY` rather than weakening identity doctrine.
