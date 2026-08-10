# Audience & Conversion Architecture (Future)

Status: Phase 0 (Foundation) — documentation of future capability only
Last updated: 2026-08-10

## 1. Purpose

This document records the future architecture for commercial memory,
audience state, journey recovery, paid media, and content/creative
production. **None of this is implemented in Phase 0.** It exists so Phase 4
(audience memory, attribution, conversion) and Phase 3 (targeting,
distribution) can be built against a settled design rather than an ad hoc
one. See [ROADMAP.md](ROADMAP.md).

## 2. Commercial Memory (Future — Phase 4)

The system should eventually maintain a unified commercial memory that
knows, where lawful and permissioned:

- person/business identity reference
- campaign reached
- channel/source
- engagement history
- SecurePay product usage
- audience state (Section 3)
- consent/marketing status
- suppression/do-not-contact status
- next-best-action

Commercial memory is deliberately kept as a separate concern from raw
intelligence (see ADR-006 and
[SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md)): intelligence is about the
market in general, commercial memory is about specific, identifiable
people/businesses and carries stricter consent and suppression obligations.

## 3. Audience States (Future)

A person/business record will move through one of these states:

```
UNKNOWN → REACHED → ENGAGED → INTERESTED → REGISTERED → FIRST_USE → ACTIVE → HIGH_VALUE
                                                                         ↘ DORMANT
                                                                         ↘ SUPPRESSED (any state)
```

- **UNKNOWN** — no record of contact yet.
- **REACHED** — a message/ad/outreach was delivered.
- **ENGAGED** — the audience member interacted (opened, clicked, replied).
- **INTERESTED** — expressed explicit interest (e.g. requested a demo).
- **REGISTERED** — created a SecurePay account/KSNumber.
- **FIRST_USE** — completed a first meaningful product action.
- **ACTIVE** — ongoing regular use.
- **HIGH_VALUE** — high engagement/volume/referral activity.
- **DORMANT** — was active, has gone quiet.
- **SUPPRESSED** — must not be contacted (opt-out, compliance, or policy);
  overrides all other states.

## 4. Journey Recovery (Future — Phase 4)

Future support for detecting and helping resume unfinished journeys, such
as:

- KSNumber registration started but not completed
- SecureLink draft started but not completed
- KeyContract draft abandoned
- onboarding incomplete
- demo abandoned

Future flow:

```
SecurePay product event
   → journey memory
   → incomplete journey detected
   → next-best-action
   → approved outreach   (HIGH risk — see AI_GOVERNANCE.md)
   → resume journey
```

Any outreach step in this flow is a HIGH-risk action per
[AI_GOVERNANCE.md](AI_GOVERNANCE.md) and requires human approval by default.

## 5. Paid Media (Future — Phase 3)

Future support for Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads, and other
ad providers, following the same provider-agnostic pattern as
[MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md) (adapters behind a common
interface, not vendor-specific application code).

Initial creative strategy is **image-first, not image-only.**

Every paid media campaign must define:

- campaign objective
- audience
- creative variants
- budget
- destination
- conversion attribution
- approval

AI must never have unrestricted authority to increase ad spend — launching
or increasing paid-media spend is a HIGH-risk action per
[AI_GOVERNANCE.md](AI_GOVERNANCE.md) and requires human approval.

## 6. Content & Creative Studio (Future — Phase 2)

Content & Creative Studio is a first-class future module, not a bolt-on. It
should eventually produce:

- image ads
- social posts
- headlines
- descriptions
- CTA variants
- landing-page copy
- short demo concepts
- engagement suggestions

Creative providers must be replaceable, following the same adapter pattern
used for AI providers (see [MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md)).
Specific tools (for example, Holo) may later be plugged in as optional
providers behind that interface — they are never architectural dependencies
of the Outreach Engine itself.

All creative output is subject to
[SECUREPAY_POSITIONING_RULES.md](SECUREPAY_POSITIONING_RULES.md) before it
can be classified PUBLIC.

## 7. Non-Goals for Phase 0

None of the systems in this document are implemented in Phase 0: no
commercial memory store, no audience-state engine, no journey-recovery
engine, no paid-media integration, no creative generation pipeline. This
document exists purely to lock the design so later phases build toward it
consistently.
