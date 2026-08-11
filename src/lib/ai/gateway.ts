import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { getSafeMode } from "@/lib/safe-mode/state";
import { routeTask } from "./router";
import { getAdapter } from "./adapters";
import type { AIExecutionRequest, AIExecutionResult } from "./types";

// Single entry/exit point for all AI calls — see docs/MODEL_CONTROL_PLANE.md
// Section 3. Application code must call AIGateway.execute(), never a
// provider adapter or router directly (docs/PHASE_2_AI_PROVIDER_INTEGRATION.md
// "No Phase 2 business logic may call Anthropic directly").
//
// Phase 2 adds real execution: if routing selects a provider whose adapter
// implements execute() (Anthropic when configured, or the mock provider —
// always), the Gateway actually calls it and returns EXECUTED with the raw
// text output plus usage. If routing selects a provider without a live
// execute() (openai/google Phase 1 stubs), it returns NOT_IMPLEMENTED,
// unchanged from Phase 1. If nothing is routable, NO_AVAILABLE_MODEL.
// Every path — including Safe Mode blocks and execution errors — records a
// usage record and an AI_EXECUTION audit event, so the traceability
// contract in docs/AI_GOVERNANCE.md Section 6 always holds.
export async function execute(request: AIExecutionRequest): Promise<AIExecutionResult> {
  const safeMode = await getSafeMode();
  if (safeMode === "SAFE_MODE") {
    const reason = "Blocked: system is in SAFE_MODE (docs/AUDIT_AND_CONTROL.md Section 4).";
    const usageRecordId = await recordUsage(request, { providerId: null, modelId: null, reason, success: false });
    await recordAuditEvent({
      eventType: "AI_EXECUTION",
      actorUserId: request.requestedByUserId,
      targetType: "ai_task",
      targetId: request.taskType,
      metadata: { correlationId: request.correlationId, blocked: true, reason },
    });
    return { outcome: "NO_AVAILABLE_MODEL", reason, usageRecordId };
  }

  const decision = await routeTask(request.taskType);

  if (decision.outcome === "NO_AVAILABLE_MODEL") {
    const usageRecordId = await recordUsage(request, {
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
    return { ...decision, usageRecordId };
  }

  const { provider, model, reason } = decision;
  const adapter = getAdapter(provider.key);

  if (!adapter?.execute || !request.prompt) {
    // No live execute() implemented for this provider (openai/google Phase 1
    // stubs), or the caller didn't supply a prompt to run. Deliberate Phase
    // 1/2 boundary, not a bug.
    const usageRecordId = await recordUsage(request, { providerId: provider.id, modelId: model.id, reason, success: false });
    await recordAuditEvent({
      eventType: "AI_EXECUTION",
      actorUserId: request.requestedByUserId,
      targetType: "ai_task",
      targetId: request.taskType,
      metadata: { correlationId: request.correlationId, outcome: "NOT_IMPLEMENTED", provider: provider.key, model: model.modelKey },
    });
    return {
      outcome: "NOT_IMPLEMENTED",
      reason: "Routing succeeded but no live provider adapter (or no prompt) is available.",
      selectedProvider: provider,
      selectedModel: model,
      usageRecordId,
    };
  }

  const startedAt = Date.now();
  try {
    const output = await adapter.execute({
      taskType: request.taskType,
      modelKey: model.modelKey,
      system: request.prompt.system,
      prompt: request.prompt.user,
      maxOutputTokens: request.maxOutputTokens,
    });
    const latencyMs = Date.now() - startedAt;
    const estimatedCostUsd = estimateCost(output.inputTokens, output.outputTokens, model);

    const usageRecordId = await recordUsage(request, {
      providerId: provider.id,
      modelId: model.id,
      reason,
      success: true,
      latencyMs,
      inputUnits: output.inputTokens,
      outputUnits: output.outputTokens,
      estimatedCostUsd,
    });
    await recordAuditEvent({
      eventType: "AI_EXECUTION",
      actorUserId: request.requestedByUserId,
      targetType: "ai_task",
      targetId: request.taskType,
      metadata: {
        correlationId: request.correlationId,
        outcome: "EXECUTED",
        provider: provider.key,
        model: model.modelKey,
        latencyMs,
        isMock: provider.isMock,
      },
    });

    return {
      outcome: "EXECUTED",
      selectedProvider: provider,
      selectedModel: model,
      rawOutput: output.text,
      inputTokens: output.inputTokens,
      outputTokens: output.outputTokens,
      latencyMs,
      estimatedCostUsd,
      usageRecordId,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Unknown execution error";

    const usageRecordId = await recordUsage(request, {
      providerId: provider.id,
      modelId: model.id,
      reason,
      success: false,
      latencyMs,
    });
    await recordAuditEvent({
      eventType: "AI_EXECUTION",
      actorUserId: request.requestedByUserId,
      targetType: "ai_task",
      targetId: request.taskType,
      metadata: { correlationId: request.correlationId, outcome: "EXECUTION_ERROR", provider: provider.key, model: model.modelKey },
    });

    return {
      outcome: "EXECUTION_ERROR",
      selectedProvider: provider,
      selectedModel: model,
      error: message,
      usageRecordId,
    };
  }
}

function estimateCost(
  inputTokens: number | null,
  outputTokens: number | null,
  model: { costInputPer1kUsd: number | null; costOutputPer1kUsd: number | null }
): number | null {
  if (inputTokens === null || outputTokens === null) return null;
  if (model.costInputPer1kUsd === null || model.costOutputPer1kUsd === null) return null;
  const cost = (inputTokens / 1000) * model.costInputPer1kUsd + (outputTokens / 1000) * model.costOutputPer1kUsd;
  return Math.round(cost * 100000) / 100000;
}

async function recordUsage(
  request: AIExecutionRequest,
  outcome: {
    providerId: string | null;
    modelId: string | null;
    reason: string;
    success: boolean;
    latencyMs?: number;
    inputUnits?: number | null;
    outputUnits?: number | null;
    estimatedCostUsd?: number | null;
  }
): Promise<string> {
  const [row] = await db
    .insert(schema.aiUsageRecords)
    .values({
      taskType: request.taskType,
      providerId: outcome.providerId,
      modelId: outcome.modelId,
      requestedByUserId: request.requestedByUserId,
      success: outcome.success,
      routingReason: outcome.reason,
      latencyMs: outcome.latencyMs ?? null,
      inputUnits: outcome.inputUnits ?? null,
      outputUnits: outcome.outputUnits ?? null,
      estimatedCostUsd:
        outcome.estimatedCostUsd !== undefined && outcome.estimatedCostUsd !== null
          ? String(outcome.estimatedCostUsd)
          : null,
      correlationId: request.correlationId,
    })
    .returning({ id: schema.aiUsageRecords.id });
  return row!.id;
}

export const AIGateway = { execute };
