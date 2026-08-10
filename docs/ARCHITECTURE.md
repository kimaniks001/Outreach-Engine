# Architecture

Status: Phase 0 (Foundation)
Last updated: 2026-08-10

## 1. Purpose

This document records the system architecture principles the Outreach
Engine must follow, and recommends a pragmatic technology stack for Phase 1
onward. The repository was empty at the start of Phase 0 (no application
code, no framework, no dependencies), so this is a recommendation for future
phases to adopt, not a description of code that exists today.

## 2. Architecture Principles

1. **Provider-agnostic AI.** See
   [MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md). No vendor SDK is called
   directly from application code.
2. **Server-side authorization.** See
   [ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md) Section 5. The backend
   is the enforcement boundary, not the UI. See ADR-003.
3. **Human approval by default for consequential external actions.** See
   [AI_GOVERNANCE.md](AI_GOVERNANCE.md). See ADR-004.
4. **Provenance-first intelligence.** See
   [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md). See ADR-005.
5. **Commercial memory is separate from raw intelligence.** See
   [AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](AUDIENCE_AND_CONVERSION_ARCHITECTURE.md)
   Section 2. See ADR-006.
6. **SecurePay API and Outreach Engine remain separate products/domains.**
   The Outreach Engine observes and acts on the commercial layer; it is not
   a fork or extension of SecurePay's core payments/agreement system, and it
   does not gain implicit access to SecurePay's internal data model.
7. **Lean phases, minimal infrastructure per phase.** Do not build ahead of
   the phase that needs it (see [ROADMAP.md](ROADMAP.md)).

## 3. High-Level Logical Architecture (Target, Phase 1+)

```
                     ┌───────────────────────────┐
                     │   Web Dashboard (RBAC UI) │
                     └─────────────┬─────────────┘
                                   │ HTTPS
                     ┌─────────────▼─────────────┐
                     │   Backend API              │
                     │   - AuthN/AuthZ (RBAC)     │
                     │   - Server-side enforcement│
                     │   - Audit logging           │
                     └──────┬───────────────┬─────┘
                            │               │
                 ┌──────────▼───┐   ┌───────▼──────────┐
                 │  PostgreSQL   │   │   AI Gateway      │
                 │  (system of   │   │   → Model Router  │
                 │   record)     │   │   → Provider      │
                 └───────────────┘   │     adapters       │
                                     └────────────────────┘
```

- The web dashboard never talks to the database or AI providers directly —
  everything goes through the backend API, which is the single
  authorization and audit choke point.
- The AI Gateway (see [MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md)) is a
  module within/behind the backend API in Phase 1, not a separately exposed
  public service.
- No AI provider adapters are implemented in Phase 0; no credentials exist
  yet.

## 4. Recommended Technology Stack

The repository is empty. This is a recommendation for Phase 1, chosen for
simplicity and to avoid over-engineering a framework the product doesn't
need yet:

| Layer | Recommendation | Why |
|---|---|---|
| Language | TypeScript (strict mode) | One language across frontend/backend; strong typing helps enforce the RBAC/risk-tier contracts in code |
| Backend | Node.js with a minimal framework (e.g. Fastify or Express) | Small surface area, no unnecessary abstraction; easy to add server-side authorization middleware |
| Web dashboard | React + a lightweight meta-framework (e.g. Vite or Next.js) | Standard, widely supported, no exotic tooling |
| Database | PostgreSQL | Relational integrity fits RBAC, audit, and provenance models well; mature, well-understood, supports future read replicas for an eventual read-only Analytics API |
| ORM/Query layer | A typed query builder or lightweight ORM (e.g. Drizzle or Prisma) | Keeps schema and types in sync without a heavy framework |
| AuthN | Standard session or JWT-based auth (library, not hand-rolled crypto) | Avoid inventing cryptography |
| Testing | A standard TS test runner (e.g. Vitest or Jest) | Needed from Phase 1 onward given the RBAC/risk-tier logic that must be correct |
| Package manager | npm (already available in this environment) | No need to introduce another toolchain |

This stack is intentionally boring. It supports everything Phase 0 asked
this document to keep possible (RBAC, AI provider abstraction, ad
integrations later, a future read-only Analytics API) without committing to
a large application framework before Phase 1 needs one.

## 5. Why No Scaffolding in Phase 0

Phase 0's brief is documentation-first: "Do not create a large application
framework unless needed in Phase 0." No `package.json`, source tree, or
dependencies are added in this phase. Phase 1 is where the recommendation in
Section 4 gets turned into an actual project skeleton, informed by whatever
is still true about the team's needs at that time.

## 6. Future Read-Only Analytics API (Not Built Now)

The Outreach Engine may later expose a narrow, read-only Analytics &
Insights API, separate from SecurePay's own API. Keeping this possible
without building it now means:

- The backend API should be organized so analytics read-paths (campaign
  analytics, conversion funnels, channels, attribution, audience aggregate
  analytics, impact metrics) are already separated from write/mutation logic
  and from RESTRICTED-classification data (see
  [DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md)).
- Anything that must never be exposed by such an API — doctrine, raw
  intelligence sources, prompts, credentials, private audience profiles,
  internal model logic — should never be reachable from the same query path
  as analytics aggregates, even internally.
- No API is built, versioned, or exposed in Phase 0 or Phase 1. See ADR-007
  and [ROADMAP.md](ROADMAP.md) Phase 5.

## 7. Non-Goals for Phase 0

No code, dependencies, database, or deployment infrastructure exists yet.
This document is the reference Phase 1 implementation must be validated
against.
