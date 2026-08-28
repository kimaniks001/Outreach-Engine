import { describe, expect, it } from "vitest";
import type { Campaign, CreativeVariant } from "@/lib/db/schema";
import { fingerprintCampaignBundle } from "./fingerprint";

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    opportunityId: "00000000-0000-4000-8000-000000000102",
    name: "Property clarity",
    objective: "Explain staged agreements",
    targetAudience: "Property buyers",
    positioningAngle: "Clarity before money moves",
    coreMessage: "Money should follow the agreement.",
    recommendedChannelTypes: ["META_FACEBOOK"],
    cta: "See how it works",
    destinationConcept: null,
    creativeBrief: "Simple market language",
    riskLevel: "HIGH",
    brandGuardianStatus: "PASS",
    status: "APPROVED",
    aiUsageRecordId: null,
    isDemo: false,
    createdByUserId: null,
    createdAt: new Date("2026-08-28T00:00:00Z"),
    updatedAt: new Date("2026-08-28T00:00:00Z"),
    ...overrides,
  };
}

function variant(id: string, headline: string): CreativeVariant {
  return {
    id,
    campaignId: "00000000-0000-4000-8000-000000000101",
    variantLabel: id.endsWith("1") ? "A" : "B",
    angle: "Agreement first",
    headline,
    body: "Agree on the milestone. Let the money follow.",
    cta: "Learn more",
    imageConcept: "A simple milestone journey",
    aspectRatioSuggestions: ["square"],
    carouselConcept: null,
    demoConceptNote: null,
    rationale: "Explain the sequence clearly",
    brandGuardianStatus: "PASS",
    aiUsageRecordId: null,
    createdByUserId: null,
    createdAt: new Date("2026-08-28T00:00:00Z"),
    updatedAt: new Date("2026-08-28T00:00:00Z"),
  };
}

describe("market approval content fingerprint", () => {
  it("is stable regardless of variant query order", () => {
    const a = variant("00000000-0000-4000-8000-000000000201", "Agreement first");
    const b = variant("00000000-0000-4000-8000-000000000202", "Build with clarity");
    expect(fingerprintCampaignBundle(campaign(), [a, b])).toBe(fingerprintCampaignBundle(campaign(), [b, a]));
  });

  it("changes when market-facing creative changes", () => {
    const original = variant("00000000-0000-4000-8000-000000000201", "Agreement first");
    const changed = { ...original, headline: "A different public claim" };
    expect(fingerprintCampaignBundle(campaign(), [original])).not.toBe(fingerprintCampaignBundle(campaign(), [changed]));
  });

  it("does not change merely because workflow status changes", () => {
    expect(fingerprintCampaignBundle(campaign({ status: "APPROVED" }), [])).toBe(
      fingerprintCampaignBundle(campaign({ status: "READY_FOR_DISTRIBUTION" }), [])
    );
  });
});
