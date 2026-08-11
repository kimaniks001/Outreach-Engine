import type { AITaskType } from "../task-types";

export interface ProviderExecuteInput {
  taskType: AITaskType;
  modelKey: string;
  system?: string;
  prompt: string;
  maxOutputTokens?: number;
}

export interface ProviderExecuteOutput {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

// Every vendor SDK call must live behind this interface — see ADR-001 and
// ADR-002. Application code never imports a vendor SDK directly; it only
// ever talks to src/lib/ai/gateway.ts.
export interface ProviderAdapter {
  readonly providerKey: string;
  readonly envVar: string;
  hasCredentials(): boolean;
  // Optional: adapters without execute() are routable but the Gateway
  // returns NOT_IMPLEMENTED if one is ever selected (docs/PHASE_1
  // behavior, preserved for openai/google in Phase 2).
  execute?(input: ProviderExecuteInput): Promise<ProviderExecuteOutput>;
}
