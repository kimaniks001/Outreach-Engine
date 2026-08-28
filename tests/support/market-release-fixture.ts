import { randomUUID } from "node:crypto";
import { runCampaignBrandGuardian, reviewCampaign } from "@/lib/campaigns/campaigns";
import {
  attachClaimSource,
  createClaimSource,
  releaseCampaignToMarket,
  reviewBrandClaims,
  reviewComplianceLegal,
} from "@/lib/approvals/market-release";

// Test-only journey helper. It deliberately uses the same public service
// functions as the application so older phase tests cannot bypass the new
// Phase 2 market-release authority with a shortcut status update.
export async function releaseApprovedCampaign(campaignId: string, ownerId: string) {
  const source = await createClaimSource(
    {
      sourceKey: `test-authority-${randomUUID()}`,
      title: "Test market claim authority",
      sourceType: "DOCTRINE",
      version: "test-v1",
      sourceReference: "tests/support/market-release-fixture.ts",
    },
    ownerId,
    "OWNER"
  );

  await attachClaimSource(campaignId, source.id, ownerId, "OWNER", "Deterministic integration-test authority source.");
  await reviewBrandClaims(campaignId, "APPROVE", ownerId, "OWNER", "Test Brand & Claims approval.");
  await reviewComplianceLegal(campaignId, "APPROVE", ownerId, "OWNER", "Test Compliance/Legal clearance.");
  const released = await releaseCampaignToMarket(campaignId, ownerId, "OWNER", "Test final market release.");

  if (released.campaign.status !== "READY_FOR_DISTRIBUTION") {
    throw new Error("setup: campaign not READY_FOR_DISTRIBUTION after final market release");
  }
  return released.campaign;
}

export async function approveAndReleaseCampaign(campaignId: string, ownerId: string) {
  await runCampaignBrandGuardian(campaignId, ownerId);
  const approved = await reviewCampaign(campaignId, "APPROVE", ownerId, "Test campaign approval.");
  if (approved?.status !== "APPROVED") {
    throw new Error("setup: campaign not APPROVED before market release");
  }
  return releaseApprovedCampaign(campaignId, ownerId);
}
