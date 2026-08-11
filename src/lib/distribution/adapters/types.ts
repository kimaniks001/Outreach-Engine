import type { ChannelType } from "../channels";

// Every distribution provider integration must live behind this interface —
// see ADR-001 and docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 17.
// Application code (API routes, plan/execution services) never imports an
// adapter directly — only src/lib/distribution/router.ts and gateway.ts do.
// Mirrors src/lib/ai/adapters/types.ts's ProviderAdapter shape.

export interface DistributionLaunchInput {
  distributionPlanId: string;
  channel: ChannelType;
  approvedBudget: number;
  currency: string;
  destination: string | null;
  cta: string;
}

export interface DistributionLaunchResult {
  externalExecutionId: string;
  status: "PENDING" | "RUNNING";
  startedAt: Date;
}

export interface DistributionStatusResult {
  status: "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
  reportedSpend: number | null;
}

export interface DistributionSpendSnapshot {
  at: Date;
  amount: number;
}

export interface DistributionPauseResult {
  status: "PAUSED";
}

export interface NormalizedError {
  errorCode: string;
  normalizedError: string;
}

export interface ConfigurationCheck {
  ok: boolean;
  reason: string;
}

export interface AdapterExecutionContext {
  approvedBudget: number;
}

export interface DistributionAdapter {
  readonly adapterKey: string;
  readonly channelsSupported: readonly ChannelType[];
  // Pure/local — never makes a network call. True only when credentials +
  // adapter implementation both exist, same discipline as
  // src/lib/ai/adapters/types.ts::ProviderAdapter.hasCredentials().
  validateConfiguration(): ConfigurationCheck;
  launch(input: DistributionLaunchInput): Promise<DistributionLaunchResult>;
  pause(externalExecutionId: string): Promise<DistributionPauseResult>;
  // `context` is passed explicitly rather than recalled from adapter-local
  // memory — an adapter must never depend on in-process state surviving
  // between calls (Next.js dev-mode route compilation and serverless
  // production deployments can both give consecutive requests a fresh
  // module instance). The distribution_executions DB row remains the sole
  // source of truth for status; see src/lib/distribution/gateway.ts.
  status(externalExecutionId: string, context: AdapterExecutionContext): Promise<DistributionStatusResult>;
  spendSnapshot(externalExecutionId: string, context: AdapterExecutionContext): Promise<DistributionSpendSnapshot>;
  normalizeError(err: unknown): NormalizedError;
}
