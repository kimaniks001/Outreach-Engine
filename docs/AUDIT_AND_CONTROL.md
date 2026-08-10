# Audit & Control

Status: Phase 0 (Foundation)
Last updated: 2026-08-10

## 1. Purpose

Defines the future audit trail and the Safe Mode / kill switch mechanism
that lets an owner stop consequential activity quickly without losing
history. Kept deliberately simple: an append-oriented event log, not a
blockchain or an immutable-ledger system.

## 2. Audit Events (Future)

The system will record at least these event types once Phase 1
authentication and later phases' features exist:

- login
- permission change
- campaign approval/rejection
- publication
- outreach (send)
- ad launch/budget approval
- doctrine change
- provider/model change (see [MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md))
- integration change
- AI execution (see [AI_GOVERNANCE.md](AI_GOVERNANCE.md))
- safe-mode/kill-switch activation

Each event should record: who/what triggered it (including AI
provider/model, when applicable), when, what resource/action was affected,
and the outcome.

## 3. Design Principles

- **Append-only.** Audit records are written once and not edited or deleted
  through normal application use.
- **Simple storage.** A standard database table (or equivalent) is
  sufficient. No blockchain, no cryptographically chained immutable ledger.
  Simplicity keeps this buildable and queryable in Phase 1.
- **Queryable by role.** Audit review itself is a permission (`audit` in
  [ACCESS_CONTROL_MODEL.md](ACCESS_CONTROL_MODEL.md)), available in full to
  Owner/Super Admin and in relevant slices to other roles as needed later.

## 4. Safe Mode / Kill Switch (Future)

An Owner/Super Admin must be able to suspend, independently or together:

- public publishing
- outbound outreach
- paid-media execution
- AI agent execution
- external automations
- selected integrations

Safe Mode is a system-wide override — it does not require revoking
individual permissions one by one, and it does not depend on AI cooperating
with the instruction (it is enforced at the gateway/API layer, not requested
of the AI).

### What Safe Mode still permits

- login
- dashboard access
- historical analytics
- audit review
- configuration review

This ensures Safe Mode is a pause, not an outage — the team can still see
what happened and why while consequential external actions are suspended.

## 5. Relationship to Cost Control

Safe Mode is the manual, immediate override. Automated cost controls (daily/
monthly budget ceilings, model escalation limits — see
[MODEL_CONTROL_PLANE.md](MODEL_CONTROL_PLANE.md) Section 7) are the
continuous, automatic guard. Both should log to the audit trail when
triggered.

## 6. Non-Goals for Phase 0

Phase 0 does not implement the audit log, Safe Mode toggle, or any
enforcement code. It defines the event types and behavior those systems must
have when built starting in Phase 1.
