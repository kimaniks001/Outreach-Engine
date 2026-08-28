# Phase 2 — Brand, Claims, Compliance/Legal Approval + Provenance

## Purpose

Creative quality is not publication authority.

Phase 2 turns the existing Brand Guardian into a controlled market-release chain:

`Studio draft -> deterministic Brand Guardian -> authoritative source attachment -> human Brand & Claims approval -> Compliance/Legal when required -> final Market Release`

Only after final Market Release may later phases treat the exact reviewed material as eligible for Distribution or the Plug Market Kit.

## Core rule

> AI may create. SecurePay must authorise. Distribution may amplify. Every public claim must remain traceable to an approved source.

No AI model, campaign creator, content editor, or distribution user can convert a draft into market-authorised material merely by generating or editing it.

## Authority boundaries

### Deterministic Brand Guardian

The existing deterministic rules remain authoritative for PASS / REVISE / BLOCK. Optional AI enrichment may explain findings but cannot override them.

Phase 2 additionally checks the complete current creative bundle during human Brand & Claims approval and again at final release. This prevents an unreviewed creative variant from bypassing campaign-level checks.

### Brand & Claims human lane

In the current role model, OWNER and GROWTH_DIRECTOR may approve this lane. Approval:

- requires Brand Guardian PASS,
- requires at least one CURRENT authoritative source,
- is bound to a SHA-256 fingerprint of the exact campaign and current creative variants,
- moves a campaign to `APPROVED`, **not** `READY_FOR_DISTRIBUTION`.

### Compliance / Legal lane

All current public campaigns are HIGH risk by default, so Compliance/Legal clearance is required before release.

Until dedicated Compliance/Legal roles are explicitly designed and authorised, this lane is OWNER-only. This is intentionally conservative; the code does not pretend a missing role model exists.

### Final Market Release

Final release is OWNER-only in this phase. It requires:

- current Brand & Claims approval for the same content fingerprint and source versions,
- current Compliance/Legal approval for HIGH-risk campaigns,
- at least one current/effective authoritative claim source,
- a fresh deterministic Brand Guardian pass over current campaign + variant market copy.

A successful release creates an immutable `market_release_records` proof package and only then moves the campaign to `READY_FOR_DISTRIBUTION`.

Final release does **not** authorise ad spend, distribution budget, provider execution, or bulk outreach.

## Claim-source registry

Outreach stores a controlled reference to authoritative truth, not a new copy of that truth.

A claim source records:

- stable source key,
- title,
- source type,
- exact version,
- authoritative reference,
- optional content digest,
- CURRENT / SUPERSEDED / RETIRED status,
- optional effective dates.

An uploaded document, AI answer, Studio draft, or marketing suggestion does not become doctrine merely because it is entered into Outreach. It must already be authoritative outside Outreach before an Owner registers it as a claim source.

Retiring, superseding, or expiring a source makes any release that depended on it non-current.

## Content fingerprints and stale approvals

Approval is attached to content, not to a campaign name.

The fingerprint includes current market-facing campaign fields plus every current creative variant. Variant query order is normalized before hashing.

If campaign strategy/copy changes, the mutable campaign returns to DRAFT and Brand Guardian resets.

If a creative variant changes, the campaign also returns to DRAFT and Brand Guardian resets.

Historical approval and release rows remain append-only evidence, but `getCurrentMarketRelease()` returns null once current content or source versions no longer match the release snapshot.

This prevents old approval from silently authorising new words.

## Append-only evidence

`market_review_decisions` and `market_release_records` are protected by database triggers that reject UPDATE and DELETE.

A release snapshot includes:

- exact content fingerprint,
- source IDs, keys, versions, references and digests,
- current creative variant IDs and fingerprints,
- Brand & Claims decision ID,
- Compliance/Legal decision ID when required,
- final release decision ID,
- releasing user and timestamp,
- release version.

## Approval Desk

`/approvals` provides the staff-facing control room.

It shows:

- campaign release queue,
- risk,
- Brand Guardian status,
- current authoritative sources,
- Brand & Claims decision,
- Compliance/Legal decision,
- final release/current version.

`/approvals/[campaignId]` shows the current message, sources, separate decision gates, and append-only history.

The screen deliberately states that approval does not distribute content or authorise spend.

## Phase 3 handoff

Phase 3 — Authoritative Asset Library + Plug Market Kit — must consume only material backed by a **current** Market Release proof. A mutable campaign status alone is insufficient.

This allows the Asset Library to answer:

- Is this asset currently authorised?
- Which exact content/source versions support it?
- Who released it?
- Has the material or underlying source changed since release?

That provenance becomes the root of every future `Approved for you to use` Plug asset.
