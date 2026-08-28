import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { getSafeMode } from "@/lib/safe-mode/state";
import { routeTask } from "./router";
import { getAdapter } from "./adapters";
import { checkBudget } from "./budget";
import type { AIExecutionRequest, AIExecutionResult } from "./types";

// Single entry/exit point for all AI calls. Application code must call the
// Gateway rather than provider adapters directly. Routing, Safe Mode, model
// approval, budget checks, usage and audit evidence remain enforced here.
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

  const decision = await routeTask(request.taskType, request.preferredModelId);

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
      metadata: {
        correlationId: request.correlationId,
        outcome: decision.outcome,
        preferredModelId: request.preferredModelId ?? null,
      },
    });
    return { ...decision, usageRecordId };
  }

  const { provider, model, reason } = decision;
  const adapter = getAdapter(provider.key);

  if (!adapter?.execute || !request.prompt) {
    const usageRecordId = await recordUsage(request, { providerId: provider.id, modelId: model.id, reason, success: false });
    await recordAuditEvent({
      eventType: "AI_EXECUTION",
      actorUserId: request.requestedByUserId,
      targetType: "ai_task",
      targetId: request.taskType,
      metadata: {
        correlationId: request.correlationId,
        outcome: "NOT_IMPLEMENTED",
        provider: provider.key,
        model: model.modelKey,
        preferred: request.preferredModelId === model.id,
      },
    });
    return {
      outcome: "NOT_IMPLEMENTED",
      reason: "Routing succeeded but no live provider adapter (or no prompt) is available.",
      selectedProvider: provider,
      selectedModel: model,
      usageRecordId,
    };
  }

  const budgetCheck = await checkBudget({
    taskType: request.taskType,
    providerId: provider.id,
    modelId: model.id,
    requestedByUserId: request.requestedByUserId,
  });
  if (budgetCheck.blocked && budgetCheck.blockedByPolicy) {
    const budgetReason = `AI budget hard cap exceeded: ${budgetCheck.blockedByPolicy.scope}${
      budgetCheck.blockedByPolicy.scopeRef ? `(${budgetCheck.blockedByPolicy.scopeRef})` : ""
    } ${budgetCheck.blockedByPolicy.periodType} spend $${budgetCheck.blockedByPolicy.spend.toFixed(2)} >= cap $${budgetCheck.blockedByPolicy.hardLimitUsd.toFixed(2)}.`;
    const usageRecordId = await recordUsage(request, { providerId: provider.id, modelId: model.id, reason: budgetReason, success: false });
    await recordAuditEvent({
      eventType: "AI_BUDGET_EXCEEDED",
      actorUserId: request.requestedByUserId,
      targetType: "ai_task",
      targetId: request.taskType,
      metadata: { correlationId: request.correlationId, ...budgetCheck.blockedByPolicy },
    });
    return { outcome: "BUDGET_EXCEEDED", selectedProvider: provider, selectedModel: model, reason: budgetReason, usageRecordId };
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
        preferred: request.preferredModelId === model.id,
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
      metadata: {
        correlationId: request.correlationId,
        outcome: "EXECUTION_ERROR",
        provider: provider.key,
        model: model.modelKey,
        preferred: request.preferredModelId === model.id,
      },
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
