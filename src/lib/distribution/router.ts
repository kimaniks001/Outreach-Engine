import type { DistributionAdapter } from "./adapters/types";
import { getDistributionAdapter } from "./adapters";
import { CHANNEL_ADAPTER_KEY, type ChannelType } from "./channels";

// Pure, deterministic, explainable — mirrors src/lib/ai/router.ts's role.
// Business logic never imports an adapter directly; it always goes through
// this router (or gateway.ts, which calls the router). See
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 17.

export type DistributionRoutingDecision =
  | { outcome: "ROUTED"; adapter: DistributionAdapter; adapterKey: string }
  | { outcome: "NOT_AVAILABLE"; reason: string };

export function routeDistribution(
  channel: ChannelType,
  executionMode: "PLAN_ONLY" | "SIMULATED" | "SANDBOX" | "LIVE"
): DistributionRoutingDecision {
  if (executionMode === "PLAN_ONLY") {
    return { outcome: "NOT_AVAILABLE", reason: "Execution mode is PLAN_ONLY — no adapter is ever invoked." };
  }

  if (executionMode === "SIMULATED") {
    const adapter = getDistributionAdapter("simulated");
    if (!adapter) return { outcome: "NOT_AVAILABLE", reason: "Simulated adapter is not registered." };
    return { outcome: "ROUTED", adapter, adapterKey: "simulated" };
  }

  // SANDBOX / LIVE — route to the channel's real provider adapter, which in
  // this phase always reports not-configured (no credentials exist). Never
  // falls back to the simulated adapter for SANDBOX/LIVE — that would
  // misrepresent a real execution mode as controlled.
  const adapterKey = CHANNEL_ADAPTER_KEY[channel];
  if (!adapterKey) {
    return { outcome: "NOT_AVAILABLE", reason: `No live or sandbox adapter exists for channel ${channel} in Phase 3.` };
  }
  const adapter = getDistributionAdapter(adapterKey);
  if (!adapter) return { outcome: "NOT_AVAILABLE", reason: `Adapter "${adapterKey}" is not registered.` };

  const check = adapter.validateConfiguration();
  if (!check.ok) return { outcome: "NOT_AVAILABLE", reason: check.reason };

  return { outcome: "ROUTED", adapter, adapterKey };
}
