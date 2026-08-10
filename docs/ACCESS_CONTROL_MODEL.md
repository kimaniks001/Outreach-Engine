# Access Control Model

Status: Phase 0 (Foundation)
Last updated: 2026-08-10

## 1. Purpose

A simple, extensible RBAC (role-based access control) model, defined now so
Phase 1 authentication and authorization can be built directly against it
without redesign.

Design goal: a small number of roles and a small number of permission
categories, extensible by adding new categories, not by multiplying roles.
Do not create hundreds of fine-grained permissions.

## 2. Roles

### OWNER / SUPER ADMIN

Full access to everything: doctrine, configuration, credentials, all
intelligence, all campaigns, all analytics, RBAC itself, Safe Mode / kill
switch.

### GROWTH DIRECTOR

Can see: intelligence, campaigns, distribution, analytics, and
recommendations.

Cannot see by default: secrets (credentials, API keys, restricted
configuration).

### STRATEGIST

Can see: approved intelligence, campaign planning, audience research, and
experiments.

Cannot see: unapproved/raw intelligence sources, doctrine editing, secrets.

### CONTENT & ENGAGEMENT

Example seat: Lisa.

Can see:

- approved content
- drafts
- content calendar
- engagement queue
- approved AI response suggestions
- assigned work
- basic performance metrics

Must NOT automatically see:

- SecurePay doctrine
- raw intelligence sources
- confidential strategy
- system prompts
- model configuration
- credentials
- sensitive prospect intelligence
- restricted analytics

### DISTRIBUTION / SALES

Can see: approved prospects, outreach, follow-ups, account/opportunity
status.

Cannot see: raw intelligence sources, doctrine, credentials, restricted
analytics.

### ANALYST

Read-only access to approved analytics.

Cannot see: doctrine, raw intelligence sources, credentials, campaign
execution controls.

## 3. Permission Model

Rather than a large permission matrix, permissions are expressed as a small
set of **capabilities** applied against a small set of **resource
categories**. This keeps the model extensible without exploding into
hundreds of individual permissions.

Capabilities (verbs):

- `view`
- `create`
- `edit`
- `approve`
- `publish` (a subset of HIGH-risk `approve`, see
  [AI_GOVERNANCE.md](AI_GOVERNANCE.md))
- `administer` (role/config/doctrine changes)

Resource categories (nouns):

- `doctrine`
- `intelligence` (with a `raw` vs `approved` visibility split — see
  [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md))
- `campaigns`
- `content`
- `distribution` / `prospects`
- `analytics`
- `audience` / `commercial-memory` (future, see
  [AUDIENCE_AND_CONVERSION_ARCHITECTURE.md](AUDIENCE_AND_CONVERSION_ARCHITECTURE.md))
- `model-config` (AI provider/model settings, see
  [MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md))
- `credentials` / `secrets`
- `audit`

A role is defined as a set of `(capability, resource category, visibility
scope)` grants. This is the extension point for future roles or resources —
add a grant, not a new mechanism.

## 4. Role-to-Capability Summary

| Role | doctrine | intelligence | campaigns | content | distribution | analytics | model-config | credentials | audit |
|---|---|---|---|---|---|---|---|---|---|
| Owner / Super Admin | full | full | full | full | full | full | full | full | full |
| Growth Director | view | view (approved+raw) | view/approve | view | view | view | view | none | view |
| Strategist | none | view (approved) | create/edit | view | view | view (approved) | none | none | none |
| Content & Engagement | none | none | none | create/edit (drafts), view (approved) | none | view (basic) | none | none | none |
| Distribution / Sales | none | none | view (approved) | none | create/edit (approved scope) | view (approved) | none | none | none |
| Analyst | none | none | none | none | none | view (approved, read-only) | none | none | none |

This table is the initial default. It is expected to be refined once real
usage patterns emerge in Phase 1, without changing the underlying capability
× resource model.

## 5. Server-Side Enforcement

Authorization must be enforced server-side, not only hidden in the UI. Every
API endpoint that reads or mutates a resource category must check the
caller's role grants before acting. The UI may additionally hide controls a
role cannot use, but that is a convenience layer, not the security boundary.

This applies with particular force to HIGH-risk actions defined in
[AI_GOVERNANCE.md](AI_GOVERNANCE.md) — `publish`, `approve` on campaigns,
outreach sends, and paid-media spend must be blocked server-side for any
role/action combination not explicitly granted.

## 6. Confidential-Conclusion-Without-Source Pattern

A role may be granted visibility into an intelligence *conclusion* (e.g. "the
SME lending market in Nairobi shows rising interest in escrow-adjacent
tooling") without being granted visibility into the *raw source* behind it,
where that source is classified CONFIDENTIAL or higher. This is implemented
as a visibility scope on the `intelligence` resource category (Section 3),
not as a separate role. See [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md)
Section 4.

## 7. Non-Goals for Phase 0

Phase 0 does not implement authentication, session management, or the actual
authorization middleware. It defines the model those systems (Phase 1) must
implement.
