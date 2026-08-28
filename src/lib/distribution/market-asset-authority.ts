import { listAssetLibrary } from "@/lib/assets/market-assets";

export class MarketAssetNotAuthorisedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketAssetNotAuthorisedError";
  }
}

export interface DistributionAssetAuthority {
  marketAssetIds: string[];
  creativeVariantIds: string[];
}

/**
 * Distribution may execute only creative that is represented by a CURRENT
 * authoritative Market Asset. Brand Guardian PASS alone is not publication
 * authority: the exact parent Market Release must still be current and the
 * asset's latest state must still be RELEASED.
 *
 * This is deliberately re-checked immediately before execution so a plan
 * that was READY yesterday fails closed if its release is revoked,
 * superseded or made stale by a governing campaign/source change today.
 */
export async function assertCurrentMarketAssetsForVariants(
  campaignId: string,
  creativeVariantIds: string[]
): Promise<DistributionAssetAuthority> {
  if (creativeVariantIds.length === 0) {
    throw new MarketAssetNotAuthorisedError(
      "Distribution requires at least one creative variant backed by a current approved Market Asset."
    );
  }

  const library = await listAssetLibrary();
  const currentForCampaign = library.filter(
    (row) => row.asset.campaignId === campaignId && row.approvedForUse
  );

  const marketAssetIds: string[] = [];
  const missingVariantIds: string[] = [];

  for (const creativeVariantId of creativeVariantIds) {
    const currentAsset = currentForCampaign.find(
      (row) => row.asset.creativeVariantId === creativeVariantId
    );
    if (!currentAsset) {
      missingVariantIds.push(creativeVariantId);
      continue;
    }
    marketAssetIds.push(currentAsset.asset.id);
  }

  if (missingVariantIds.length > 0) {
    throw new MarketAssetNotAuthorisedError(
      `Every creative variant must have a CURRENT released Market Asset before distribution. Missing authority for ${missingVariantIds.length} variant(s).`
    );
  }

  return {
    marketAssetIds: [...new Set(marketAssetIds)],
    creativeVariantIds: [...new Set(creativeVariantIds)],
  };
}
