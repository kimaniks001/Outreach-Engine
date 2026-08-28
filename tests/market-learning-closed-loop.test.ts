import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createSignal } from "@/lib/intelligence/signals";
import { analyzeSignalAndCreateOpportunity, reviewOpportunity } from "@/lib/intelligence/opportunities";
import { createCampaignFromOpportunity } from "@/lib/campaigns/campaigns";
import { approveAndReleaseCampaign } from "./support/market-release-fixture";
import { releaseMarketAsset, revokeMarketAsset } from "@/lib/assets/market-assets";
import { recordMarketInsight, recordMarketKitUsage, getCampaignMarketKitLearning } from "@/lib/market-learning/market-learning";
import { getRapidResponseQueue } from "@/lib/impact/market-loop";

async function ownerId() {
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  if (!owner) throw new Error("No OWNER seeded.");
  return owner.id;
}

async function releasedAsset(owner: string) {
  const signal = await createSignal(
    { title: `Market learning fixture ${randomUUID()}`, summary: "Test", signalType: "MANUAL" },
    owner
  );
  const analysis = await analyzeSignalAndCreateOpportunity(signal.id, owner);
  if (!analysis.ok) throw new Error("Fixture analysis failed.");
  await reviewOpportunity(analysis.opportunity.id, "APPROVE", owner);
  const campaign = await createCampaignFromOpportunity({
    opportunityId: analysis.opportunity.id,
    name: `Market learning campaign ${randomUUID()}`,
    objective: "Learn from authorised market use",
    targetAudience: "Traders",
    positioningAngle: "Agreement clarity",
    coreMessage: "Money should follow the agreement.",
    cta: "Learn more",
  }, owner);
  const [variant] = await db.insert(schema.creativeVariants).values({
    campaignId: campaign.id,
    variantLabel: "A",
    angle: "Clear agreement",
    headline: "Agree first.",
    body: "Make the agreement clear, then let the money follow.",
    cta: "Learn more",
    imageConcept: "Two traders confirming a clear agreement",
    rationale: "Plain agreement-first communication.",
    brandGuardianStatus: "PASS",
    createdByUserId: owner,
  }).returning();
  await approveAndReleaseCampaign(campaign.id, owner);
  const asset = await releaseMarketAsset({ campaignId: campaign.id, creativeVariantId: variant!.id, kind: "SOCIAL_POST" }, owner, "OWNER");
  return { campaign, asset };
}

describe("Completion Phase 5 market learning loop", () => {
  it("records Plug insight without storing contact identity and exposes rapid response as review-first", async () => {
    const signal = await recordMarketInsight({
      source: "PLUG",
      title: `Customers are confusing Payment Ready with payment sent ${randomUUID()}`,
      summary: "Several market conversations show confusion between readiness and completed payment.",
      rapidResponseReason: "CONFUSION",
      tags: ["payment-ready"],
    });

    expect(signal.signalType).toBe("CUSTOMER_FEEDBACK");
    expect(signal.createdByUserId).toBeNull();
    expect(signal.tags).toContain("source:plug");
    expect(signal.tags).toContain("rapid-response:confusion");

    const queue = await getRapidResponseQueue();
    const item = queue.find((row) => row.signalId === signal.id);
    expect(item?.autoPublishAllowed).toBe(false);
    expect(item?.autoSpendAllowed).toBe(false);
    expect(item?.nextStep).toMatch(/normal opportunity/i);
  });

  it("rejects obvious personal contact details from market-learning text", async () => {
    await expect(recordMarketInsight({
      source: "PLUG",
      title: "Customer feedback",
      summary: "Call me on 0712345678 so I can explain the market issue.",
    })).rejects.toThrow(/must not contain personal/i);

    await expect(recordMarketInsight({
      source: "STAFF",
      title: "Customer feedback",
      summary: "The affected customer is person@example.com and asked for follow-up.",
    })).rejects.toThrow(/must not contain personal/i);
  });

  it("records Market Kit usage only while the exact asset remains currently authorised", async () => {
    const owner = await ownerId();
    const { campaign, asset } = await releasedAsset(owner);

    const recorded = await recordMarketKitUsage({ assetId: asset.id, action: "SHARED", source: "PLUG_MARKET_KIT" });
    expect(recorded.recorded).toBe(true);

    const learning = await getCampaignMarketKitLearning(campaign.id);
    expect(learning.observedUsageEvents).toBeGreaterThanOrEqual(1);
    expect(learning.byAction.SHARED).toBeGreaterThanOrEqual(1);
    expect(learning.interpretation).toMatch(/not conversion/i);

    await revokeMarketAsset(asset.id, owner, "OWNER", "Test revocation");
    await expect(recordMarketKitUsage({ assetId: asset.id, action: "SHARED", source: "PLUG_MARKET_KIT" }))
      .rejects.toThrow(/CURRENT approved Market Asset/i);
  });
});
