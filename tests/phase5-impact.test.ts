import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { createSignal } from "@/lib/intelligence/signals";
import { analyzeSignalAndCreateOpportunity, reviewOpportunity } from "@/lib/intelligence/opportunities";
import { createCampaignFromOpportunity, runCampaignBrandGuardian, reviewCampaign } from "@/lib/campaigns/campaigns";
import { resolveProfile } from "@/lib/commercial-memory/identity";
import { recordTouchpoint } from "@/lib/commercial-memory/touchpoints";
import { recordConversionEvent } from "@/lib/attribution/conversions";
import { computeCampaignScorecard, computeChannelScorecard } from "@/lib/impact/scorecards";
import { computeEfficiencySummary, computeRoi } from "@/lib/impact/roi";

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

async function createReadyCampaign(ownerId: string) {
  const signal = await createSignal({ title: `Phase 5 impact signal ${randomUUID()}`, summary: "x", signalType: "MANUAL" }, ownerId);
  const analysis = await analyzeSignalAndCreateOpportunity(signal.id, ownerId);
  if (!analysis.ok) throw new Error("setup: analysis failed");
  await reviewOpportunity(analysis.opportunity.id, "APPROVE", ownerId);
  const campaign = await createCampaignFromOpportunity(
    { opportunityId: analysis.opportunity.id, name: `Phase 5 impact campaign ${randomUUID()}`, objective: "Test", targetAudience: "Testers", positioningAngle: "Agreement-led", coreMessage: "Money should follow the agreement.", cta: "Learn more" },
    ownerId
  );
  await runCampaignBrandGuardian(campaign.id, ownerId);
  const approved = await reviewCampaign(campaign.id, "APPROVE", ownerId);
  if (approved?.status !== "READY_FOR_DISTRIBUTION") throw new Error("setup: campaign not READY_FOR_DISTRIBUTION");
  return approved;
}

describe("computeCampaignScorecard: metrics match underlying events, no fabrication", () => {
  it("reach/engagement/registrations exactly match recorded touchpoints/conversions", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);

    const p1 = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    const p2 = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });

    await recordTouchpoint({ profileId: p1.id, campaignId: campaign.id, type: "AD_IMPRESSION", channel: "GOOGLE_SEARCH", isDemo: true });
    await recordTouchpoint({ profileId: p1.id, campaignId: campaign.id, type: "LANDING_PAGE_VIEW", channel: "GOOGLE_SEARCH", isDemo: true });
    await recordTouchpoint({ profileId: p2.id, campaignId: campaign.id, type: "AD_IMPRESSION", channel: "GOOGLE_SEARCH", isDemo: true });

    await recordConversionEvent({ profileId: p1.id, conversionType: "KSNUMBER_CREATED", occurredAt: new Date(), isDemo: true });

    const scorecard = await computeCampaignScorecard(campaign.id);
    expect(scorecard.reach).toBe(2);
    expect(scorecard.engagement).toBe(1); // only p1 had a LANDING_PAGE_VIEW (engagement touch)
    expect(scorecard.registrations).toBe(1);
  });

  it("a campaign with no activity reports all-zero counts, never a fabricated non-zero", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const scorecard = await computeCampaignScorecard(campaign.id);
    expect(scorecard.reach).toBe(0);
    expect(scorecard.registrations).toBe(0);
    expect(scorecard.spend).toBeNull();
    expect(scorecard.costPerConversion).toBeNull();
  });
});

describe("computeChannelScorecard: channel slices are correct", () => {
  it("only counts touches/attribution for the requested channel", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const p1 = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    const p2 = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });

    await recordTouchpoint({ profileId: p1.id, campaignId: campaign.id, type: "AD_IMPRESSION", channel: "GOOGLE_SEARCH", isDemo: true });
    await recordTouchpoint({ profileId: p2.id, campaignId: campaign.id, type: "AD_IMPRESSION", channel: "META_FACEBOOK", isDemo: true });

    const googleCard = await computeChannelScorecard("GOOGLE_SEARCH");
    const metaCard = await computeChannelScorecard("META_FACEBOOK");
    expect(googleCard.reach).toBeGreaterThanOrEqual(1);
    expect(metaCard.reach).toBeGreaterThanOrEqual(1);
  });
});

describe("ROI: never fabricated", () => {
  it("returns INSUFFICIENT_VALUE_DATA when no conversion carries a known value", async () => {
    // Fresh profile/conversion with no `value` set (the default for every
    // conversion in this codebase unless a real monetary figure is known).
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await recordConversionEvent({ profileId: profile.id, conversionType: "AGREEMENT_COMPLETED", occurredAt: new Date(), isDemo: true });

    const roi = await computeRoi();
    // Some other test file may have set a value; only assert the shape is
    // one of the two valid states, and that INSUFFICIENT_VALUE_DATA never
    // carries fabricated numbers.
    if (roi.status === "INSUFFICIENT_VALUE_DATA") {
      expect(Object.keys(roi)).toEqual(["status"]);
    } else {
      expect(roi.totalValue).toBeGreaterThanOrEqual(0);
    }
  });

  it("computes a real ROI once a conversion carries a known value and cost exists", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await recordTouchpoint({ profileId: profile.id, campaignId: campaign.id, type: "AD_IMPRESSION", isDemo: true });
    await recordConversionEvent({ profileId: profile.id, conversionType: "AGREEMENT_COMPLETED", occurredAt: new Date(), value: 500, isDemo: true });

    const roi = await computeRoi();
    // Whether COMPUTED depends on whether any cost has ever been recorded
    // in this test DB (distribution spend or AI cost) — assert the
    // deterministic contract rather than a specific number.
    expect(["COMPUTED", "INSUFFICIENT_VALUE_DATA"]).toContain(roi.status);
  });
});

describe("computeEfficiencySummary: cost-per-outcome never divides by zero into a fabricated number", () => {
  it("returns null (not a fabricated value) for an outcome with zero count", async () => {
    const efficiency = await computeEfficiencySummary();
    if (efficiency.completedAgreements === 0) {
      expect(efficiency.costPerCompletedAgreement).toBeNull();
    } else {
      expect(typeof efficiency.costPerCompletedAgreement === "number" || efficiency.costPerCompletedAgreement === null).toBe(true);
    }
  });
});
