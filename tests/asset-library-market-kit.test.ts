import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { approveAndReleaseCampaign } from "./support/market-release-fixture";
import {
  listPlugMarketKit,
  releaseMarketAsset,
} from "@/lib/assets/market-assets";
import { marketAssets } from "@/lib/assets/schema";
import type { PlugMarketAuthorityResult } from "@/lib/market-network/plug-market-authority";

async function ownerId() {
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  if (!owner) throw new Error("No OWNER seeded.");
  return owner.id;
}

async function freshCampaignWithVariant(owner: string) {
  const [signal] = await db.insert(schema.marketSignals).values({
    title: `Asset signal ${randomUUID()}`,
    summary: "Test market asset source.",
    signalType: "MANUAL",
    status: "ANALYZED",
    createdByUserId: owner,
  }).returning();
  const [opportunity] = await db.insert(schema.opportunities).values({
    marketSignalId: signal!.id,
    title: "Agreement clarity",
    problem: "People need a clear explanation.",
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
    name: `Market Kit ${randomUUID()}`,
    objective: "Explain agreement-led trade",
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
    imageConcept: "Two traders agreeing on a clear sequence before money moves",
    rationale: "Keeps the agreement ahead of the payment.",
    createdByUserId: owner,
  }).returning();
  return { campaign: campaign!, variant: variant! };
}

const activePlug: PlugMarketAuthorityResult = {
  status: "CONNECTED",
  reason: "test",
  profile: {
    standing: "ACTIVE",
    marketReady: true,
    enrolled: true,
    canRepresentMarket: true,
    entryStatementVersion: "test-v1",
    enteredAt: new Date().toISOString(),
    exitedAt: null,
  },
};

const inactivePlug: PlugMarketAuthorityResult = {
  status: "CONNECTED",
  reason: "test",
  profile: {
    standing: "REFRESH_REQUIRED",
    marketReady: false,
    enrolled: true,
    canRepresentMarket: false,
    entryStatementVersion: "test-v1",
    enteredAt: new Date().toISOString(),
    exitedAt: null,
  },
};

describe("Authoritative Asset Library + Plug Market Kit", () => {
  it("cannot mint a market asset from campaign status alone", async () => {
    const owner = await ownerId();
    const { campaign, variant } = await freshCampaignWithVariant(owner);
    await db.update(schema.campaigns).set({ status: "READY_FOR_DISTRIBUTION" }).where(eq(schema.campaigns.id, campaign.id));

    await expect(
      releaseMarketAsset(
        { campaignId: campaign.id, creativeVariantId: variant.id, kind: "WHATSAPP_MESSAGE" },
        owner,
        "OWNER"
      )
    ).rejects.toThrow(/current final Market Release/i);
  });

  it("mints immutable approved content only from a current final Market Release", async () => {
    const owner = await ownerId();
    const { campaign, variant } = await freshCampaignWithVariant(owner);
    await approveAndReleaseCampaign(campaign.id, owner);

    const asset = await releaseMarketAsset(
      {
        campaignId: campaign.id,
        creativeVariantId: variant.id,
        kind: "WHATSAPP_MESSAGE",
        locale: "en-KE",
        usageGuidance: "Use when introducing agreement-led trade in a customer chat.",
      },
      owner,
      "OWNER"
    );

    expect(asset.approvedContent.headline).toBe(variant.headline);
    expect(asset.approvedContent.body).toBe(variant.body);
    expect(asset.approvedContent.cta).toBe(variant.cta);

    const original = asset.approvedContent;
    await expect(
      db.update(marketAssets)
        .set({ approvedContent: { ...original, headline: "tampered" } })
        .where(eq(marketAssets.id, asset.id))
    ).rejects.toThrow();

    const [stored] = await db.select().from(marketAssets).where(eq(marketAssets.id, asset.id)).limit(1);
    expect(stored?.approvedContent).toEqual(original);
  });

  it("shows only a safe projection to an ACTIVE Plug and exposes no approval/source internals", async () => {
    const owner = await ownerId();
    const { campaign, variant } = await freshCampaignWithVariant(owner);
    await approveAndReleaseCampaign(campaign.id, owner);
    await releaseMarketAsset(
      { campaignId: campaign.id, creativeVariantId: variant.id, kind: "SOCIAL_POST" },
      owner,
      "OWNER"
    );

    const kit = await listPlugMarketKit(activePlug);
    const item = kit.find((entry) => entry.campaignName === campaign.name);
    expect(item).toBeTruthy();
    expect(item?.approvedForUse).toBe(true);
    expect(item?.body).toBe(variant.body);

    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain("sourceSnapshot");
    expect(serialized).not.toContain("sourceReference");
    expect(serialized).not.toContain("brandDecisionId");
    expect(serialized).not.toContain("complianceDecisionId");
    expect(serialized).not.toContain("releasedByUserId");
  });

  it("fails closed when SecurePay says the identity cannot represent the market", async () => {
    expect(await listPlugMarketKit(inactivePlug)).toEqual([]);
  });

  it("automatically withdraws an asset from the current kit when its parent market release becomes stale", async () => {
    const owner = await ownerId();
    const { campaign, variant } = await freshCampaignWithVariant(owner);
    await approveAndReleaseCampaign(campaign.id, owner);
    const asset = await releaseMarketAsset(
      { campaignId: campaign.id, creativeVariantId: variant.id, kind: "POSTER_COPY" },
      owner,
      "OWNER"
    );

    expect((await listPlugMarketKit(activePlug)).some((entry) => entry.id === asset.id)).toBe(true);

    await db.update(schema.campaigns)
      .set({ coreMessage: "A changed message awaiting fresh review.", updatedAt: new Date() })
      .where(eq(schema.campaigns.id, campaign.id));

    expect((await listPlugMarketKit(activePlug)).some((entry) => entry.id === asset.id)).toBe(false);
  });
});
