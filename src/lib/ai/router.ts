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

// Pure, deterministic, explainable — see the Phase 1 brief Section 15.
// Never falls back to an unapproved/unavailable provider; if nothing
// qualifies it returns NO_AVAILABLE_MODEL rather than guessing. No
// self-optimization: Phase 1 does not learn from past outcomes.
//
// Rule: prefer the highest quality_score; tie-break on lowest input cost;
// tie-break again on model key for stability. All three fields are
// optional, so candidates missing them sort after ones that have them.
export function selectModel(
  candidates: RoutingCandidate[],
  taskType: AITaskType
): RoutingDecision {
  if (candidates.length === 0) {
    return {
      outcome: "NO_AVAILABLE_MODEL",
      reason: `No approved, enabled model from an AVAILABLE provider supports task type ${taskType}.`,
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

export async function routeTask(taskType: AITaskType): Promise<RoutingDecision> {
  const candidates = await listRoutableModelsForTask(taskType);
  return selectModel(candidates, taskType);
}
