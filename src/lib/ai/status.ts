import type { AIProviderStatus } from "./types";

export interface ProviderStatusInputs {
  enabled: boolean;
  adapterImplemented: boolean;
  credentialsConfigured: boolean;
  manuallyDegraded: boolean;
}

// Pure function — see docs/MODEL_CONTROL_PLANE.md Section 4: a provider is
// AVAILABLE only when adapter + credentials + approval(enabled) all hold.
// Phase 1 has no live health checks, so DEGRADED is only reachable via an
// explicit manual owner override, never inferred automatically. This is
// intentionally side-effect free so it can be unit tested without a
// database — see tests/ai-router.test.ts.
export function deriveProviderStatus(inputs: ProviderStatusInputs): AIProviderStatus {
  if (!inputs.enabled) return "DISABLED";
  if (!inputs.adapterImplemented || !inputs.credentialsConfigured) return "NOT_CONFIGURED";
  if (inputs.manuallyDegraded) return "DEGRADED";
  return "AVAILABLE";
}
