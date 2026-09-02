# True North Phase 5 — Operations + Incident Command Completion Report

**Roadmap:** `docs/OUTREACH_TRUE_NORTH_NERVE_CENTRE_MASTER_ROADMAP_v2.0.md`  
**Status:** IMPLEMENTED ON STACKED BRANCH — VALIDATION/REVIEW REQUIRED  
**Dependency:** This branch is stacked on True North Phase 4 (`true-north-phase-4-trader-support`). Phase 5 must not reach `main` ahead of its Phase 4 dependency.

## Delivered

- Operator-facing Operations workspace with active incident pulse and evidence-first service signals.
- Incident declaration creates one internal incident record, one `OPERATIONS` Work responsibility and one staff incident conversation in a single transaction.
- Severity (`SEV1`–`SEV4`), commander, responders, lifecycle, affected service, operator-estimated trader impact and chronology.
- Privacy-scoped incident visibility: Owner oversight or explicit commander/responder participation only.
- Trader support cases can be linked only when the actor already has support-case visibility.
- Incident resolution is synchronized to the linked Work responsibility and database-guarded against unfinished Work dependencies.
- External communication state is tracked without acquiring publication authority. `RELEASED` requires Owner oversight plus an external release-evidence reference; Outreach records that evidence but does not publish the message.
- Root-cause/resolution chronology and prevention actions. Prevention becomes ordinary governed `OPERATIONS` Work.
- Service signals are evidence-only observations. Repeated evidence can accumulate, but signals do not automatically declare incidents or manufacture SecurePay operational truth.

## Authority boundary

Outreach coordinates people, response, chronology, Work and internal communication. It does **not** acquire or alter SecurePay identity, agreement, Payment Ready, payment, release, settlement, ledger, fee, referral/Lifetime Share, Choice Bank or provider authority.

`affected_trader_count` is deliberately treated as an **operator estimate** in this phase. It must not be presented as an authoritative backend count until a separately authorised SecurePay projection exists.

Incident communication state is operational metadata. Recording `RELEASED` means an authorised external workflow supplied release evidence; it is not a publishing command.

## Security and privacy review

- Incident reads fail closed for unrelated staff.
- Adding a responder explicitly adds that user to the incident record, conversation room and Work collaborators.
- Support-case linkage re-checks the actor's existing Work-derived support visibility.
- Incident terminal transitions are blocked while the incident Work item has unfinished dependencies.
- Resolution requires a non-empty resolution summary.
- Release state requires Owner oversight and evidence.
- No raw SecurePay financial or identity data is stored by the incident domain.

## Automated evidence added

`tests/phase5-incident-command.test.ts` covers:

- atomic Work + room + incident creation;
- severity-to-priority behavior;
- privacy before/after responder membership;
- resolution and dependency guards;
- trader-impact estimate chronology;
- external communication evidence boundary;
- privacy-safe support-case linking;
- prevention Work creation;
- evidence-only service signal accumulation.

## Validation gate

The phase is not considered merge-ready until the exact pull-request head passes the repository validation workflow (migration, seed, lint, typecheck, full automated tests and production build) and review has no unresolved substantive findings.

## Retained dependency blocker

True North Phase 4 still requires a separately authorised SecurePay staff-support projection for safe trader-context retrieval. Phase 5 implementation can be reviewed and validated while stacked, but it must not bypass or obscure that protected backend authority decision.
