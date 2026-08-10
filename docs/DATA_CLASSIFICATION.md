# Data Classification

Status: Phase 0 (Foundation)
Last updated: 2026-08-10

## 1. Purpose

A simple, four-level classification model used across the Outreach Engine to
decide who can see what and how data must be handled. This underpins
[ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md) and
[AUDIT_AND_CONTROL.md](AUDIT_AND_CONTROL.md).

## 2. Levels

### PUBLIC

Safe for anyone, including the general public, to see.

Examples: published marketing content, public campaign creative once live,
public-facing landing page copy.

### INTERNAL

Not secret, but not for external distribution. Default level for ordinary
day-to-day work product.

Examples: ordinary campaign work, drafts in progress, internal performance
summaries, the content calendar.

### CONFIDENTIAL

Sensitive to SecurePay's competitive position or to individuals/businesses
referenced in it. Restricted to roles with a legitimate need, per
[ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md).

Examples: growth strategy, non-public analytics, prospect intelligence,
intelligence sources where the source itself is restricted (see
[SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md) Section 4).

### RESTRICTED

Highest sensitivity. Access limited to Owner/Super Admin and systems that
require it to function.

Examples: API keys, credentials, sensitive configuration (e.g. model routing
overrides, provider secrets).

## 3. Classification Rules

- Every stored intelligence item, campaign asset, and analytics artifact
  should carry exactly one classification level.
- Default to the higher of two plausible levels when uncertain — it is safer
  to under-share than to leak.
- Classification is independent of, but informs, the RBAC visibility scopes
  defined in [ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md) Section 3.
- Downgrading a classification (e.g. CONFIDENTIAL → PUBLIC, as content moves
  toward publication) is itself a reviewable action and should be logged per
  [AUDIT_AND_CONTROL.md](AUDIT_AND_CONTROL.md).
- RESTRICTED data (credentials, secrets) must never be stored in the same
  record as INTERNAL or lower-classified content, and must never be returned
  by a general-purpose read API — including any future Analytics API (see
  [ARCHITECTURE.md](ARCHITECTURE.md) Section 6).

## 4. Non-Goals for Phase 0

Phase 0 does not implement classification enforcement in code — there is no
data store yet. It defines the model that Phase 1's data layer and Phase 2's
intelligence store must apply from day one.
