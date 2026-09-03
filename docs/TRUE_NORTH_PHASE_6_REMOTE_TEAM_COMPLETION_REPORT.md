# True North Phase 6 — Remote Team Operating System

Phase 6 adds explicit presence, working hours, timezone/language context, scheduled queue coverage, on-duty rotations and immutable-context Work handovers.

## Authority boundary

These records coordinate internal responsibility. They are not payroll, employment, identity, agreement, payment, release, settlement, referral, Lifetime Share or other SecurePay authority. Owner oversight schedules coverage and rotations. Only the current active Work owner may hand over ordinary work; incident responsibility remains governed by Incident Command.

## Acceptance evidence

- People shows who is available, local working windows, workload, coverage and rotations.
- Work supports explicit handover with summary and next action.
- Handover atomically transfers the single accountable owner and appends Work history.
- Tests cover presence, owner-only coverage, rotations, handover convergence and authority boundaries.
- CI is the authoritative migration, seed, lint, typecheck, test and build gate.
