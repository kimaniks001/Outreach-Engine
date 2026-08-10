import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { getSafeMode } from "@/lib/safe-mode/state";
import { routeTask } from "./router";
import type { AIExecutionRequest, AIExecutionResult } from "./types";

// Single entry/exit point for all AI calls — see docs/MODEL_CONTROL_PLANE.md
// Section 3. Application code must call AIGateway.execute(), never a
// provider adapter or router directly.
//
// Phase 1 never performs a live provider call: either no model is available
// (NO_AVAILABLE_MODEL, the expected Phase 1 default — see the Phase 1 brief
// Section 13) or a model is selected but no adapter implements a live
// execute() method yet (NOT_IMPLEMENTED). Both paths still record a usage
// record and an AI_EXECUTION audit event, so the traceability contract in
// docs/AI_GOVERNANCE.md Section 6 holds even though nothing "real" ran.
export async function execute(request: AIExecutionRequest): Promise<AIExecutionResult> {
  const safeMode = await getSafeMode();
  if (safeMode === "SAFE_MODE") {
    const reason = "Blocked: system is in SAFE_MODE (docs/AUDIT_AND_CONTROL.md Section 4).";
    await recordUsage(request, { providerId: null, modelId: null, reason, success: false });
    await recordAuditEvent({
      eventType: "AI_EXECUTION",
      actorUserId: request.requestedByUserId,
      targetType: "ai_task",
      targetId: request.taskType,
      metadata: { correlationId: request.correlationId, blocked: true, reason },
    });
    return { outcome: "NO_AVAILABLE_MODEL", reason };
  }

  const decision = await routeTask(request.taskType);

  if (decision.outcome === "NO_AVAILABLE_MODEL") {
    await recordUsage(request, {
      providerId: null,
      modelId: null,
      reason: decision.reason,
      success: false,
    });
    await recordAuditEvent({
      eventType: "AI_EXECUTION",
      actorUserId: request.requestedByUserId,
      targetType: "ai_task",
      targetId: request.taskType,
      metadata: { correlationId: request.correlationId, outcome: decision.outcome },
    });
    return decision;
  }

  // decision.outcome === "SELECTED" — routing worked, but Phase 1 has no
  // live adapter execute() implementation (see src/lib/ai/adapters). This
  // is a deliberate Phase 1 boundary, not a bug.
  await recordUsage(request, {
    providerId: decision.provider.id,
    modelId: decision.model.id,
    reason: decision.reason,
    success: false,
  });
  await recordAuditEvent({
    eventType: "AI_EXECUTION",
    actorUserId: request.requestedByUserId,
    targetType: "ai_task",
    targetId: request.taskType,
    metadata: {
      correlationId: request.correlationId,
      outcome: "NOT_IMPLEMENTED",
      provider: decision.provider.key,
      model: decision.model.modelKey,
      whySelected: decision.reason,
    },
  });

  return {
    outcome: "NOT_IMPLEMENTED",
    reason: "Routing succeeded but no live provider adapter is implemented in Phase 1.",
    selectedProvider: decision.provider,
    selectedModel: decision.model,
  };
}

async function recordUsage(
  request: AIExecutionRequest,
  outcome: { providerId: string | null; modelId: string | null; reason: string; success: boolean }
): Promise<void> {
  await db.insert(schema.aiUsageRecords).values({
    taskType: request.taskType,
    providerId: outcome.providerId,
    modelId: outcome.modelId,
    requestedByUserId: request.requestedByUserId,
    success: outcome.success,
    routingReason: outcome.reason,
    correlationId: request.correlationId,
  });
}

export const AIGateway = { execute };
