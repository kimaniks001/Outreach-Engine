import type { DistributionAdapter } from "./types";
import { simulatedAdapter } from "./simulated";
import { googleAdsAdapter } from "./google-ads";
import { metaAdsAdapter } from "./meta-ads";

// The only place that lists which distribution adapters exist at all —
// mirrors src/lib/ai/adapters/index.ts. Adding a new provider means adding
// a file here; application code elsewhere never changes.
export const DISTRIBUTION_ADAPTERS: Record<string, DistributionAdapter> = {
  simulated: simulatedAdapter,
  google_ads: googleAdsAdapter,
  meta_ads: metaAdsAdapter,
};

export function getDistributionAdapter(adapterKey: string): DistributionAdapter | null {
  return DISTRIBUTION_ADAPTERS[adapterKey] ?? null;
}
