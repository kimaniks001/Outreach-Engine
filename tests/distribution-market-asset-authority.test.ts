import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { approveAndReleaseCampaign } from "./support/market-release-fixture";
import { releaseMarketAsset, revokeMarketAsset } from "@/lib/assets/market-assets";
import {
  assertCurrentMarketAssetsForVariants,
  MarketAssetNotAuthorisedError,
} from "@/lib/distribution/market-asset-authority";

async function ownerId() {
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  if (!owner) throw new Error("No OWNER seeded.");
  return owner.id;
}

async function freshCampaignWithVariant(owner: string) {
  const [signal] = await db.insert(schema.marketSignals).values({
    title: `Distribution authority signal ${randomUUID()}`,
    summary: "Test source for distribution authority.",
    signalType: "MANUAL",
    status: "ANALYZED",
    createdByUserId: owner,
  }).returning();
  const [opportunity] = await db.insert(schema.opportunities).values({
    marketSignalId: signal!.id,
    title: "Agreement clarity",
    problem: "Traders need approved market communication.",
    targetAudience: "Traders",
    securepayRelevance: "Agreement-led trade",
    moneyFlowMapping: "ONE_TO_ONE",
    evidenceSummary: "Test evidence",
    confidence: "0.90",
    opportunityScore: 80,
    status: "APPROVED",
    createdByUserId: owner,
  }).returning();
  const [campaign] = await db.insert(schema.campaigns).values({
    opportunityId: opportunity!.id,
    name: `Distribution authority ${randomUUID()}`,
    objective: "Explain approved agreement-led trade",
    targetAudience: "Traders",
    positioningAngle: "Agreement clarity",
    coreMessage: "Money should follow the agreement.",
    cta: "See how it works",
    riskLevel: "HIGH",
    status: "DRAFT",
    createdByUserId: owner,
  }).returning();
  const [variant] = await db.insert(schema.creativeVariants).values({
    campaignId: campaign!.id,
    variantLabel: "A",
    angle: "Agreement first",
    headline: "Agree first. Then let the money follow.",
    body: "Set out what should happen, confirm it clearly, then let the money follow the agreement.",
    cta: "See how SecurePay works",
    imageConcept: "Two traders agreeing before money moves",
    rationale: "Keeps the agreement ahead of the payment.",
    brandGuardianStatus: "PASS",
    createdByUserId: owner,
  }).returning();
  return { campaign: campaign!, variant: variant! };
}

describe("Distribution market-asset authority", () => {
  it("fails closed when a creative has no CURRENT released Market Asset", async () => {
    const owner = await ownerId();
    const { campaign, variant } = await freshCampaignWithVariant(owner);
    await approveAndReleaseCampaign(campaign.id, owner);

    await expect(
      assertCurrentMarketAssetsForVariants(campaign.id, [variant.id])
    ).rejects.toBeInstanceOf(MarketAssetNotAuthorisedError);
  });

  it("accepts the exact creative only while a current released Market Asset exists", async () => {
    const owner = await ownerId();
    const { campaign, variant } = await freshCampaignWithVariant(owner);
    await approveAndReleaseCampaign(campaign.id, owner);
    const asset = await releaseMarketAsset(
      { campaignId: campaign.id, creativeVariantId: variant.id, kind: "SOCIAL_POST" },
      owner,
      "OWNER"
    );

    const authority = await assertCurrentMarketAssetsForVariants(campaign.id, [variant.id]);
    expect(authority.marketAssetIds).toContain(asset.id);

    await revokeMarketAsset(asset.id, owner, "OWNER", "Withdrawn for test");
    await expect(
      assertCurrentMarketAssetsForVariants(campaign.id, [variant.id])
    ).rejects.toBeInstanceOf(MarketAssetNotAuthorisedError);
  });

  it("blocks execution authority when the parent Market Release becomes stale", async () => {
    const owner = await ownerId();
    const { campaign, variant } = await freshCampaignWithVariant(owner);
    await approveAndReleaseCampaign(campaign.id, owner);
    await releaseMarketAsset(
      { campaignId: campaign.id, creativeVariantId: variant.id, kind: "WHATSAPP_MESSAGE" },
      owner,
      "OWNER"
    );

    await db.update(schema.campaigns)
      .set({ coreMessage: "Changed governing message requiring fresh approval.", updatedAt: new Date() })
      .where(eq(schema.campaigns.id, campaign.id));

    await expect(
      assertCurrentMarketAssetsForVariants(campaign.id, [variant.id])
    ).rejects.toBeInstanceOf(MarketAssetNotAuthorisedError);
  });
});
