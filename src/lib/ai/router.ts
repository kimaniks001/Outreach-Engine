import type { AIModel, AIProvider } from "./types";
import type { AITaskType } from "./task-types";
import { listRoutableModelsForTask } from "./registry";

export interface RoutingCandidate {
  model: AIModel;
  provider: AIProvider;
}

export type RoutingDecision =
  | {
      outcome: "SELECTED";
      model: AIModel;
      provider: AIProvider;
      reason: string;
    }
  | {
      outcome: "NO_AVAILABLE_MODEL";
      reason: string;
    };

// Pure, deterministic and explainable. Never falls back to an unapproved or
// unavailable provider. When Studio asks for a preferred model, that model
// must already be in the registry's routable set for the task; preference is
// not an authority bypass.
export function selectModel(
  candidates: RoutingCandidate[],
  taskType: AITaskType,
  preferredModelId?: string
): RoutingDecision {
  if (candidates.length === 0) {
    return {
      outcome: "NO_AVAILABLE_MODEL",
      reason: `No approved, enabled model from an AVAILABLE provider supports task type ${taskType}.`,
    };
  }

  if (preferredModelId) {
    const preferred = candidates.find(({ model }) => model.id === preferredModelId);
    if (!preferred) {
      return {
        outcome: "NO_AVAILABLE_MODEL",
        reason: `Preferred model is not currently approved and AVAILABLE for task type ${taskType}.`,
      };
    }
    return {
      outcome: "SELECTED",
      model: preferred.model,
      provider: preferred.provider,
      reason: `Selected ${preferred.provider.displayName}/${preferred.model.displayName}: explicitly chosen in Studio and currently approved for ${taskType}.`,
    };
  }

  const sorted = [...candidates].sort((a, b) => {
    const qualityDiff = (b.model.qualityScore ?? -1) - (a.model.qualityScore ?? -1);
    if (qualityDiff !== 0) return qualityDiff;

    const aCost = a.model.costInputPer1kUsd ?? Number.POSITIVE_INFINITY;
    const bCost = b.model.costInputPer1kUsd ?? Number.POSITIVE_INFINITY;
    if (aCost !== bCost) return aCost - bCost;

    return a.model.modelKey.localeCompare(b.model.modelKey);
  });

  const winner = sorted[0]!;
  return {
    outcome: "SELECTED",
    model: winner.model,
    provider: winner.provider,
    reason: `Selected ${winner.provider.displayName}/${winner.model.displayName}: approved for ${taskType}, highest quality score among AVAILABLE candidates.`,
  };
}

export async function routeTask(
  taskType: AITaskType,
  preferredModelId?: string
): Promise<RoutingDecision> {
  const candidates = await listRoutableModelsForTask(taskType);
  return selectModel(candidates, taskType, preferredModelId);
}
