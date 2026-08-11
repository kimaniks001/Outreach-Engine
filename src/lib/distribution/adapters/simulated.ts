import { randomUUID } from "node:crypto";
import type {
  AdapterExecutionContext,
  DistributionAdapter,
  DistributionLaunchInput,
  DistributionLaunchResult,
  DistributionPauseResult,
  DistributionSpendSnapshot,
  DistributionStatusResult,
} from "./types";
import { CHANNEL_TYPES } from "../channels";

// The one real distribution adapter this phase implements — proves the full
// execution architecture without spending money. Every output is tagged
// SIMULATED / NOT LIVE; nothing here ever calls a real ad platform. See
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 19.
//
// Deliberately stateless: no in-memory Map of past executions. An adapter
// must not depend on process-local memory surviving between calls (Next.js
// dev-mode route compilation gives different API routes separately
// instantiated modules, and serverless production deployments don't share
// memory across invocations at all — an earlier, stateful version of this
// adapter hit exactly that bug: pause() failed with "unknown execution id"
// because launch() and pause() landed in different module instances). The
// distribution_executions DB row is the sole source of truth for
// status/lifecycle; this adapter only ever derives synthetic figures
// deterministically from (externalExecutionId, context) passed in on every
// call — see src/lib/distribution/gateway.ts.
//
// Test hook: passing this exact string as `cta` deterministically fails
// launch() — used by tests/phase3-* to exercise the failure path without
// relying on timing or randomness. Never a real CTA a user would submit.
export const SIMULATE_FAILURE_MARKER = "__SIMULATE_FAILURE__";

// Deterministic 5-34% spend-of-budget figure derived from the execution id
// itself, so repeated calls for the same id are always stable — no
// wall-clock dependency, no randomness, no remembered state.
function hashPercent(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return 5 + (hash % 30);
}

function deterministicSpend(externalExecutionId: string, context: AdapterExecutionContext): number {
  return Math.round(context.approvedBudget * (hashPercent(externalExecutionId) / 100) * 100) / 100;
}

export const simulatedAdapter: DistributionAdapter = {
  adapterKey: "simulated",
  channelsSupported: CHANNEL_TYPES,

  validateConfiguration() {
    // Needs no credentials by design — always AVAILABLE, same discipline as
    // src/lib/ai/adapters/mock.ts.
    return { ok: true, reason: "Simulated adapter requires no credentials and is always available." };
  },

  async launch(input: DistributionLaunchInput): Promise<DistributionLaunchResult> {
    if (input.cta === SIMULATE_FAILURE_MARKER) {
      throw new Error("Simulated launch failure (deterministic test marker).");
    }

    return { externalExecutionId: `sim_${randomUUID()}`, status: "RUNNING", startedAt: new Date() };
  },

  // Pausing a simulated campaign has no external effect to confirm — the
  // caller (src/lib/distribution/gateway.ts) already validated the
  // execution's current DB state before calling this, and writes PAUSED to
  // the DB itself. This always succeeds.
  async pause(): Promise<DistributionPauseResult> {
    return { status: "PAUSED" };
  },

  // Status is reported as RUNNING deterministically — this simulated
  // adapter never independently claims a campaign has stopped; the DB
  // record (updated by explicit launch()/pause() calls) remains the
  // authoritative lifecycle state, and callers must not overwrite it from
  // this response. See src/lib/distribution/gateway.ts::refreshExecutionStatus.
  async status(externalExecutionId: string, context: AdapterExecutionContext): Promise<DistributionStatusResult> {
    return { status: "RUNNING", reportedSpend: deterministicSpend(externalExecutionId, context) };
  },

  async spendSnapshot(externalExecutionId: string, context: AdapterExecutionContext): Promise<DistributionSpendSnapshot> {
    return { at: new Date(), amount: deterministicSpend(externalExecutionId, context) };
  },

  normalizeError(err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown simulated adapter error.";
    return { errorCode: "SIMULATED_EXECUTION_ERROR", normalizedError: message };
  },
};
