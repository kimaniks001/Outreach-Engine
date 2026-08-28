import type { AITaskType } from "./task-types";

// Core AI Gateway vocabulary. Nothing in this file makes a network call — it
// is the typed contract used by the governed Model Control Plane.

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
  // Studio may ask for a particular approved model. This is a preference
  // constrained by the registry, never an override: if the model is not
  // currently routable for this task the Gateway fails closed rather than
  // silently calling it or falling back to an unapproved model.
  preferredModelId?: string;
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
    }
  | {
      outcome: "BUDGET_EXCEEDED";
      selectedProvider: AIProvider;
      selectedModel: AIModel;
      reason: string;
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
