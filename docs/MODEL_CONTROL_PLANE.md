# Model Control Plane

Status: Phase 0 (Foundation)
Last updated: 2026-08-10

## 1. Purpose

The Outreach Engine must remain model-agnostic and provider-agnostic. This
document defines the logical architecture that guarantees that, and the
metadata the system will record about every provider/model so routing
decisions and past AI actions are explainable and auditable.

No API credentials are required or configured in Phase 0. This document
governs how Phase 1's AI Gateway must be built.

## 2. Principle: Provider and Model Agnosticism

The product must never be hard-coded to a specific vendor (Claude, GPT,
Gemini, or any other). See ADR-001 and ADR-002. This protects SecurePay from
vendor lock-in, pricing shocks, single-provider outages, and quality
regressions in any one model.

## 3. Logical Flow

```
APPLICATION
   │
   ▼
AI GATEWAY            ← single entry/exit point for all AI calls
   │
   ▼
MODEL ROUTER           ← picks provider/model for a given task type
   │
   ▼
APPROVED PROVIDER / MODEL
```

- **Application** code never calls a provider SDK directly. It calls the AI
  Gateway with a task type and payload.
- **AI Gateway** is the single choke point: it enforces risk-tier rules (see
  [AI_GOVERNANCE.md](AI_GOVERNANCE.md)), records usage, and enforces cost
  controls (Section 6).
- **Model Router** selects an approved provider/model for the task type,
  based on approved task types, quality/cost/latency data, and fallback
  rules.
- **Provider adapters** are the only place vendor-specific SDK code lives.
  Swapping or adding a vendor means adding an adapter, not touching
  application code.

## 4. Provider Availability

A provider/model is only **AVAILABLE** for use when all three are true:

1. Its adapter exists in the codebase.
2. Valid credentials are configured for it.
3. The specific provider/model has been approved for the task types it will
   be used for.

Examples of providers the architecture must accommodate (none integrated in
Phase 0): Anthropic/Claude, OpenAI, Google Gemini, and future providers.

## 5. Model Metadata

The system will record the following metadata per provider/model, starting
in Phase 1:

- `provider`
- `model`
- `status` (e.g. approved, pending review, deprecated)
- `credentials_configured` (yes/no)
- `capabilities` (e.g. text generation, structured output, vision)
- `approved_task_types` (which task types this model may be routed to)
- `quality_score`
- `latency`
- `cost`
- `structured_output_reliability`
- `human_acceptance_rate` / `human_rejection_rate`
- `fallback_rate`

## 6. Task Execution Record

Every AI task execution will be attributable, in the form:

```
Task: <task type, e.g. market intelligence>
Provider: <provider>
Model: <model>
Why selected: <reason — e.g. approved for task type, lowest cost within quality floor>
Cost: <value>
Latency: <value>
Quality: <score>
```

This record is what makes [AI_GOVERNANCE.md](AI_GOVERNANCE.md) Section 6
(traceability) enforceable, and feeds cost control (Section 7 below).

## 7. Cost Control (Future)

The Model Router and AI Gateway will support, starting no later than the
phase that first spends real AI budget:

- cost per task, per campaign, per opportunity, per conversion
- daily and monthly budget ceilings
- model escalation limits (e.g. blocking automatic routing to a more
  expensive model without approval)

No billing infrastructure is built in Phase 0. See
[AUDIT_AND_CONTROL.md](AUDIT_AND_CONTROL.md) Section 5 for how cost controls
relate to Safe Mode.

## 8. Model/Provider Change Approval

Changing which provider/model is approved for a task type, or changing
routing rules that affect HIGH-risk task types, requires human approval and
must be logged as an audit event (see
[AUDIT_AND_CONTROL.md](AUDIT_AND_CONTROL.md)). This mirrors the "human
approval by default" principle in
[OUTREACH_ENGINE_DOCTRINE.md](OUTREACH_ENGINE_DOCTRINE.md).

## 9. Non-Goals for Phase 0

Phase 0 does not implement the AI Gateway, Model Router, or any provider
adapter. It defines the contract those Phase 1 components must satisfy.
