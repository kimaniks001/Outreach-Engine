import type { AITaskType } from "./task-types";

// Core AI Gateway vocabulary, matching the Phase 1 brief Section 12 exactly,
// and docs/MODEL_CONTROL_PLANE.md. Nothing in this file makes a network
// call — it is pure typed contract.

export const AI_PROVIDER_STATUSES = [
  "NOT_CONFIGURED",
  "AVAILABLE",
  "DISABLED",
  "DEGRADED",
] as const;
export type AIProviderStatus = (typeof AI_PROVIDER_STATUSES)[number];

export interface AIProvider {
  id: string;
  key: string; // "anthropic" | "openai" | "google" | "mock" | future
  displayName: string;
  status: AIProviderStatus;
  adapterImplemented: boolean;
  credentialsConfigured: boolean;
  enabled: boolean;
  // Never presented as a real connection — see src/lib/ai/adapters/mock.ts.
  isMock: boolean;
}

export interface AIModel {
  id: string;
  providerId: string;
  modelKey: string;
  displayName: string;
  enabled: boolean;
  approved: boolean;
  status: "APPROVED" | "PENDING_REVIEW" | "DEPRECATED";
  capabilities: string[];
  approvedTaskTypes: AITaskType[];
  structuredOutputSupport: boolean;
  contextWindowTokens: number | null;
  costInputPer1kUsd: number | null;
  costOutputPer1kUsd: number | null;
  qualityScore: number | null;
}

export interface AIExecutionRequest {
  taskType: AITaskType;
  requiredCapability?: string;
  correlationId: string;
  requestedByUserId: string;
  // Phase 2: the actual structured prompt contract for a real (or mock)
  // execution. Optional because Phase 1-style probing calls (e.g. the
  // Admin routing explainer) don't need to execute anything.
  prompt?: { system?: string; user: string };
  maxOutputTokens?: number;
}

export type AIExecutionResult =
  | {
      outcome: "NO_AVAILABLE_MODEL";
      reason: string;
      usageRecordId: string;
    }
  | {
      outcome: "NOT_IMPLEMENTED";
      reason: string;
      selectedProvider: AIProvider;
      selectedModel: AIModel;
      usageRecordId: string;
    }
  | {
      outcome: "EXECUTED";
      selectedProvider: AIProvider;
      selectedModel: AIModel;
      rawOutput: string;
      inputTokens: number | null;
      outputTokens: number | null;
      latencyMs: number;
      estimatedCostUsd: number | null;
      usageRecordId: string;
    }
  | {
      outcome: "EXECUTION_ERROR";
      selectedProvider: AIProvider;
      selectedModel: AIModel;
      error: string;
      usageRecordId: string;
    };

export interface AIUsageRecord {
  id: string;
  taskType: AITaskType;
  providerId: string | null;
  modelId: string | null;
  requestedByUserId: string | null;
  success: boolean;
  routingReason: string;
  latencyMs: number | null;
  inputUnits: number | null;
  outputUnits: number | null;
  estimatedCostUsd: number | null;
  correlationId: string;
  createdAt: Date;
}
