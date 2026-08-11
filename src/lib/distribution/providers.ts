import { deriveProviderStatus } from "@/lib/ai/status";
import type { AIProviderStatus } from "@/lib/ai/types";
import { DISTRIBUTION_ADAPTERS } from "./adapters";
import type { ChannelType } from "./channels";

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 18 — provider readiness
// must never be falsely reported. Reuses the exact pure status-derivation
// function AI providers use (src/lib/ai/status.ts::deriveProviderStatus) —
// same three-condition rule: adapter + credentials + enabled all hold, or
// the provider is NOT_CONFIGURED/DISABLED. Unlike AI providers/models, these
// rows are not user-configurable data (an Owner can't add a new distribution
// provider without a code change), so there is no DB table — this is a
// static, code-level registry computed from adapter + env at read time.
export interface DistributionProviderReadiness {
  key: string;
  displayName: string;
  status: AIProviderStatus;
  channelsSupported: readonly ChannelType[];
  isSimulated: boolean;
  reason: string;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  simulated: "Simulated / Test Adapter",
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
};

// No GOOGLE_ADS_*/META_ADS_* credential is ever read anywhere in this
// codebase in Phase 3 — both stub adapters' validateConfiguration() always
// reports not-configured, so credentialsConfigured is always false here.
function credentialsConfiguredFor(adapterKey: string): boolean {
  if (adapterKey === "simulated") return true;
  return false;
}

export function listDistributionProviders(): DistributionProviderReadiness[] {
  return Object.entries(DISTRIBUTION_ADAPTERS).map(([key, adapter]) => {
    const credentialsConfigured = credentialsConfiguredFor(key);
    const configCheck = adapter.validateConfiguration();
    const status = deriveProviderStatus({
      enabled: true,
      adapterImplemented: true,
      credentialsConfigured,
      manuallyDegraded: false,
    });

    return {
      key,
      displayName: PROVIDER_DISPLAY_NAMES[key] ?? key,
      status,
      channelsSupported: adapter.channelsSupported,
      isSimulated: key === "simulated",
      reason: configCheck.reason,
    };
  });
}

export function executionAvailabilityFor(channel: ChannelType): string {
  const providers = listDistributionProviders();
  const capable = providers.filter((p) => p.channelsSupported.includes(channel));
  const available = capable.find((p) => p.status === "AVAILABLE");
  if (available) {
    return available.isSimulated
      ? `SIMULATED only — no live provider is configured for ${channel}.`
      : `${available.displayName} is AVAILABLE.`;
  }
  if (capable.length === 0) {
    return `No adapter (live or simulated) exists for ${channel} yet — planning only.`;
  }
  return `${capable.map((p) => p.displayName).join(", ")} not configured — planning/SIMULATED only.`;
}
