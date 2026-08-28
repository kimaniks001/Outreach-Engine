import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  attachClaimSource,
  createClaimSource,
  getCurrentMarketRelease,
  releaseCampaignToMarket,
  reviewBrandClaims,
  reviewComplianceLegal,
} from "@/lib/approvals/market-release";
import { marketReleaseRecords } from "@/lib/approvals/schema";

describe("sourced market release authority", () => {
  it("fails closed until Brand, source, Compliance/Legal and final release all agree on the same content", async () => {
    const [owner] = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
    expect(owner).toBeTruthy();

    const [signal] = await db.insert(schema.marketSignals).values({
      title: `Approval test ${randomUUID()}`,
      summary: "A deterministic approval-chain test signal.",
      signalType: "MANUAL",
      status: "ANALYZED",
      createdByUserId: owner!.id,
    }).returning();

    const [opportunity] = await db.insert(schema.opportunities).values({
      marketSignalId: signal!.id,
      title: "Explain agreement milestones",
      problem: "Customers need a clear explanation.",
      targetAudience: "Property buyers",
      securepayRelevance: "Agreement clarity",
      moneyFlowMapping: "ONE_TO_ONE",
      evidenceSummary: "Test evidence only",
      confidence: "0.90",
      opportunityScore: 80,
      status: "APPROVED",
      createdByUserId: owner!.id,
    }).returning();

    const [campaign] = await db.insert(schema.campaigns).values({
      opportunityId: opportunity!.id,
      name: "Approval chain test campaign",
      objective: "Explain staged agreements",
      targetAudience: "Property buyers",
      positioningAngle: "Clarity before money moves",
      coreMessage: "Money should follow the agreement.",
      cta: "See how it works",
      creativeBrief: "Explain the sequence in plain market language.",
      riskLevel: "HIGH",
      brandGuardianStatus: "PASS",
      status: "AWAITING_APPROVAL",
      createdByUserId: owner!.id,
    }).returning();

    const [variant] = await db.insert(schema.creativeVariants).values({
      campaignId: campaign!.id,
      variantLabel: "A",
      angle: "Agreement first",
      headline: "Agree on the milestone first",
      body: "Agree on the milestone. Let the money follow.",
      cta: "Learn more",
      imageConcept: "A simple illustrated milestone journey",
      rationale: "Explain the sequence clearly",
      brandGuardianStatus: "PASS",
      createdByUserId: owner!.id,
    }).returning();

    await expect(
      reviewBrandClaims(campaign!.id, "APPROVE", owner!.id, "OWNER")
    ).rejects.toThrow(/authoritative claim source/i);

    const source = await createClaimSource({
      sourceKey: `approval-test-${randomUUID()}`,
      title: "Approval test authority",
      sourceType: "DOCTRINE",
      version: "v1",
      sourceReference: "test://authoritative-source/v1",
      contentDigest: `sha256:${randomUUID().replaceAll("-", "")}`,
    }, owner!.id, "OWNER");

    await attachClaimSource(campaign!.id, source.id, owner!.id, "OWNER", "Supports the agreement-first message.");

    const brand = await reviewBrandClaims(campaign!.id, "APPROVE", owner!.id, "OWNER");
    expect(brand.campaign.status).toBe("APPROVED");

    await expect(
      releaseCampaignToMarket(campaign!.id, owner!.id, "OWNER")
    ).rejects.toThrow(/Compliance\/Legal approval is missing or stale/i);

    await expect(
      reviewComplianceLegal(campaign!.id, "APPROVE", owner!.id, "GROWTH_DIRECTOR")
    ).rejects.toThrow(/Owner-only/i);

    const compliance = await reviewComplianceLegal(campaign!.id, "APPROVE", owner!.id, "OWNER", "Reviewed for test release.");
    expect(compliance.action).toBe("APPROVE");

    const released = await releaseCampaignToMarket(campaign!.id, owner!.id, "OWNER", "Exact reviewed content released.");
    expect(released.campaign.status).toBe("READY_FOR_DISTRIBUTION");
    expect(released.release.releaseVersion).toBe(1);
    expect(await getCurrentMarketRelease(campaign!.id)).not.toBeNull();

    await db.update(schema.creativeVariants).set({
      headline: "Changed after approval",
      updatedAt: new Date(),
    }).where(eq(schema.creativeVariants.id, variant!.id));

    expect(await getCurrentMarketRelease(campaign!.id)).toBeNull();

    await expect(
      db.update(marketReleaseRecords)
        .set({ contentFingerprint: "tampered" })
        .where(eq(marketReleaseRecords.id, released.release.id))
    ).rejects.toThrow(/append-only/i);
  });
});
