# WhatsApp support worker

The WhatsApp webhook is intentionally an intake path, not the support processor. It verifies Meta, normalizes each message and persists it durably. Triage, SecurePay context reads, human routing and outbound delivery are drained by a separate worker.

## Preferred production mode

Run a separate long-lived process from the same release image:

```bash
npm run worker:whatsapp
```

Required environment:

- `DATABASE_URL`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_API_VERSION`

`SECUREPAY_AUTOMATED_SUPPORT_TOKEN` remains optional. If it is absent or cannot obtain the narrow support projection, customer-specific automation fails closed to human review.

The worker may be replicated horizontally. Queue claims use PostgreSQL `FOR UPDATE SKIP LOCKED`, so replicas share work without a separate broker. Each process drains up to 100 triage jobs and 200 outbound items per cycle; actual execution inside those batches remains bounded by the triage/outbox worker concurrency limits.

When idle, the process backs off from 250ms to 5 seconds and immediately returns to the fast cadence when work appears.

## Crash semantics

Triage processing is replay-safe: stale `PROCESSING` leases older than five minutes are reclaimed because decisions and downstream response creation are idempotent.

Outbound delivery is different. If a worker dies after Meta accepted a message but before Outreach persisted the returned provider message id, delivery cannot safely be assumed either way. A stale `SENDING` lease therefore becomes `UNCERTAIN` and is never automatically replayed. Operators can see that state in Operations and must investigate rather than risk sending the customer a duplicate message.

Recovery is attempted once per minute by each worker; the database transitions remain idempotent.

## Serverless fallback

Environments that cannot run a long-lived process may call the authenticated internal endpoint:

`POST /api/internal/support/whatsapp/drain`

using `SUPPORT_WORKER_SECRET`. The endpoint performs stale recovery, adaptive batches and returns before/after queue health plus `hasMore`. `GET` on the same endpoint returns the current runtime-health snapshot.

A serverless schedule is a fallback, not the preferred real-time support configuration: its cadence determines the minimum queue wake-up latency.

## Operations

The Outreach Operations page shows aggregate WhatsApp runtime state:

- triage ready / processing / stale
- outbound ready / sending / delivery uncertain
- oldest triage and outbound age
- waiting identity bindings
- Plug, SecurePay staff and sensitive-review shelf counts

Any `delivery uncertain` count is an action-required condition. It must not be treated as a retry queue.
