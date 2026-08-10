# SecurePay Positioning Rules

Status: Phase 0 (Foundation)
Pillar: POSITIONING
Last updated: 2026-08-10

## 1. Purpose

Positioning is one of the five locked pillars (see
[OUTREACH_ENGINE_DOCTRINE.md](OUTREACH_ENGINE_DOCTRINE.md)). Its job is to
protect how SecurePay is understood in every piece of content, campaign,
outreach message, and AI-generated output the Outreach Engine produces or
approves.

Positioning failures are cheap to make and expensive to undo — a mis-framed
tagline, ad, or outreach message shapes the market's mental model of
SecurePay for a long time. These rules exist so both humans and AI have a
fixed reference to check against before anything ships.

## 2. Core Positioning Statement

> **"Money should follow the agreement."**
> **"SecurePay is the agreement layer for money."**

Every external-facing message should be checkable against this statement. If
a piece of content doesn't connect back to "money follows the agreement" or
"SecurePay is the agreement layer," it needs review before it is treated as
on-positioning.

## 3. What SecurePay Must NOT Be Positioned As

SecurePay must not be described, framed, or allowed to be inferred — in copy,
imagery, campaign concepts, or AI-drafted content — as:

- a wallet
- a bank
- an M-PESA competitor
- another payment app
- an escrow product

These are the most likely categories a market (or a language model) will
default to when describing a payments-adjacent product, because they are
familiar. Defaulting to them is the single most likely positioning failure
mode for this system, including in AI-generated drafts, and must be
explicitly guarded against.

## 4. Why This Matters for AI-Generated Content

Language models are trained on large volumes of payments-industry content
that use "wallet," "bank," "payment app," and "escrow" as default vocabulary.
Without explicit guardrails, AI-assisted drafting will drift toward these
familiar categories by default, not because it is wrong, but because it is
the statistically common framing.

This is a POSITIONING pillar concern, and it is why a **Brand Guardian**
review function is planned for Phase 2 (see [ROADMAP.md](ROADMAP.md)) —
a check that AI-drafted or human-drafted external content passes before it
is treated as approved. Phase 0 documents this need; it does not implement
the Brand Guardian yet.

## 5. Application

- Any content classified for external distribution (see
  [DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md), PUBLIC) should be checked
  against Section 2 and Section 3 of this document before publication.
- AI content-drafting tasks (a MEDIUM risk action per
  [AI_GOVERNANCE.md](AI_GOVERNANCE.md)) should carry these rules as a standing
  constraint, not a one-time instruction.
- Human review of publication (a HIGH risk action) is the backstop for
  positioning discipline until an automated Brand Guardian check exists.

## 6. Non-Goals for This Document

This document does not define SecurePay's full brand voice, tone, or visual
identity guidelines. It defines the narrow, high-risk positioning boundary
that the Outreach Engine must never cross. Broader brand guidelines can be
layered on top of these rules in a later phase without contradicting them.
