import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { createSignal } from "@/lib/intelligence/signals";
import { addEvidence, reviewEvidence, isManualUnverified } from "@/lib/intelligence/evidence";
import { analyzeSignalAndCreateOpportunity, reviewOpportunity, getOpportunity } from "@/lib/intelligence/opportunities";
import { createCampaignFromOpportunity, runCampaignBrandGuardian, reviewCampaign } from "@/lib/campaigns/campaigns";
import { releaseApprovedCampaign } from "./support/market-release-fixture";
import { generateVariantsForCampaign } from "@/lib/creative/variants";
import { runStructuredTask } from "@/lib/ai/tasks/run-structured-task";
import { z } from "zod";

// Integration tests against a real Postgres instance (see tests/db.test.ts
// for the same convention). Requires `npm run db:migrate` and
// `npm run db:seed` already run — the seed creates the mock/test AI
// provider these tests rely on to always be AVAILABLE with zero
// credentials.

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

describe("market signals: creation and provenance", () => {
  it("creates a signal with all required fields retained", async () => {
    const ownerId = await getOwnerId();
    const signal = await createSignal(
      { title: `Test signal ${randomUUID()}`, summary: "A test observation.", signalType: "MANUAL" },
      ownerId
    );
    expect(signal.id).toBeDefined();
    expect(signal.status).toBe("NEW");
    expect(signal.createdByUserId).toBe(ownerId);
  });

  it("a signal with zero evidence rows is MANUAL/UNVERIFIED", async () => {
    const ownerId = await getOwnerId();
    const signal = await createSignal(
      { title: `Unverified signal ${randomUUID()}`, summary: "No sources.", signalType: "MANUAL" },
      ownerId
    );
    expect(await isManualUnverified(signal.id)).toBe(true);
  });

  it("evidence provenance fields are retained exactly as submitted", async () => {
    const ownerId = await getOwnerId();
    const signal = await createSignal(
      { title: `Signal with evidence ${randomUUID()}`, summary: "Has a source.", signalType: "NEWS" },
      ownerId
    );
    const evidence = await addEvidence(
      {
        marketSignalId: signal.id,
        sourceName: "Business Daily",
        sourceReference: "https://example.com/article",
        sourceType: "NEWS_ARTICLE",
        extractedClaim: "Contractors demand large deposits.",
        confidence: 0.8,
      },
      ownerId
    );
    expect(evidence.sourceName).toBe("Business Daily");
    expect(evidence.sourceReference).toBe("https://example.com/article");
    expect(evidence.extractedClaim).toBe("Contractors demand large deposits.");
    expect(await isManualUnverified(signal.id)).toBe(false);
  });

  it("new evidence cannot start as VERIFIED — only explicit review can promote it", async () => {
    const ownerId = await getOwnerId();
    const signal = await createSignal(
      { title: `Verification test ${randomUUID()}`, summary: "x", signalType: "NEWS" },
      ownerId
    );
    const evidence = await addEvidence(
      {
        marketSignalId: signal.id,
        sourceName: "Source",
        sourceType: "NEWS_ARTICLE",
        extractedClaim: "claim",
        confidence: 0.9, // even high confidence never auto-verifies
      },
      ownerId
    );
    expect(evidence.verificationStatus).not.toBe("VERIFIED");

    const reviewed = await reviewEvidence(evidence.id, "VERIFIED", ownerId);
    expect(reviewed?.verificationStatus).toBe("VERIFIED");
  });
});

describe("malformed AI output is rejected safely", () => {
  it("does not accept output that fails schema validation", async () => {
    const ownerId = await getOwnerId();
    const schema_ = z.object({ requiredField: z.string().min(1) });

    // Force the mock provider to be selected but validate against a schema
    // its response can't satisfy — simulates a malformed/unexpected output.
    const result = await runStructuredTask({
      taskType: "OPPORTUNITY_CLASSIFICATION",
      userPrompt: "SIGNAL_TITLE: x\nSIGNAL_SUMMARY: y",
      schema: schema_,
      requestedByUserId: ownerId,
    });

    expect(result.status).toBe("MALFORMED_OUTPUT");
  });
});

describe("opportunity analysis + scoring via the mock provider", () => {
  it("creates a fully-formed opportunity with a score breakdown", async () => {
    const ownerId = await getOwnerId();
    const signal = await createSignal(
      { title: `Analyzable signal ${randomUUID()}`, summary: "Something worth analyzing.", signalType: "MANUAL" },
      ownerId
    );

    const result = await analyzeSignalAndCreateOpportunity(signal.id, ownerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.opportunity.status).toBe("NEEDS_REVIEW");
    expect(result.opportunity.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(result.opportunity.opportunityScore).toBeLessThanOrEqual(100);
    expect(result.opportunity.marketSignalId).toBe(signal.id);
  });
});

describe("campaign lifecycle", () => {
  let opportunityId: string;
  let ownerId: string;

  beforeAll(async () => {
    ownerId = await getOwnerId();
    const signal = await createSignal(
      { title: `Campaign source signal ${randomUUID()}`, summary: "x", signalType: "MANUAL" },
      ownerId
    );
    const result = await analyzeSignalAndCreateOpportunity(signal.id, ownerId);
    if (!result.ok) throw new Error("setup: analysis failed");
    opportunityId = result.opportunity.id;
    await reviewOpportunity(opportunityId, "APPROVE", ownerId);
  });

  it("a campaign cannot be created from a non-approved opportunity", async () => {
    const draftOpp = await getOwnerId(); // reuse owner id as actor
    const signal = await createSignal({ title: `Unapproved ${randomUUID()}`, summary: "x", signalType: "MANUAL" }, draftOpp);
    const analysis = await analyzeSignalAndCreateOpportunity(signal.id, draftOpp);
    if (!analysis.ok) throw new Error("setup failed");

    await expect(
      createCampaignFromOpportunity(
        {
          opportunityId: analysis.opportunity.id, // still NEEDS_REVIEW, not APPROVED
          name: "Should fail",
          objective: "x",
          targetAudience: "x",
          positioningAngle: "x",
          coreMessage: "x",
          cta: "x",
        },
        draftOpp
      )
    ).rejects.toThrow();
  });

  it("campaign is linked to its opportunity", async () => {
    const campaign = await createCampaignFromOpportunity(
      {
        opportunityId,
        name: `Test Campaign ${randomUUID()}`,
        objective: "Test",
        targetAudience: "Testers",
        positioningAngle: "Agreement-led",
        coreMessage: "Money should follow the agreement.",
        cta: "Learn more",
      },
      ownerId
    );
    expect(campaign.opportunityId).toBe(opportunityId);
    expect(campaign.status).toBe("DRAFT");
  });

  it("cannot become APPROVED without a passing Brand Guardian review", async () => {
    const campaign = await createCampaignFromOpportunity(
      {
        opportunityId,
        name: `No BG review ${randomUUID()}`,
        objective: "Test",
        targetAudience: "Testers",
        positioningAngle: "Agreement-led",
        coreMessage: "Money should follow the agreement.",
        cta: "Learn more",
      },
      ownerId
    );

    await expect(reviewCampaign(campaign.id, "APPROVE", ownerId)).rejects.toThrow();
  });

  it("a BLOCKed campaign cannot be approved even after review", async () => {
    const campaign = await createCampaignFromOpportunity(
      {
        opportunityId,
        name: `Blocked campaign ${randomUUID()}`,
        objective: "Test",
        targetAudience: "Testers",
        positioningAngle: "SecurePay wallet", // deliberately violates positioning
        coreMessage: "SecurePay is an escrow wallet.",
        cta: "Get the wallet",
      },
      ownerId
    );

    const outcome = await runCampaignBrandGuardian(campaign.id, ownerId);
    expect(outcome.result).toBe("BLOCK");

    await expect(reviewCampaign(campaign.id, "APPROVE", ownerId)).rejects.toThrow();
  });

  it("campaign approval is audited but final market release is a separate authority", async () => {
    const campaign = await createCampaignFromOpportunity(
      {
        opportunityId,
        name: `Approvable ${randomUUID()}`,
        objective: "Test",
        targetAudience: "Testers",
        positioningAngle: "Agreement-led",
        coreMessage: "Money should follow the agreement.",
        cta: "Learn more",
      },
      ownerId
    );
    await runCampaignBrandGuardian(campaign.id, ownerId);
    const approved = await reviewCampaign(campaign.id, "APPROVE", ownerId);
    expect(approved?.status).toBe("APPROVED");

    const events = await db
      .select()
      .from(schema.approvalEvents)
      .where(eq(schema.approvalEvents.subjectId, campaign.id));
    expect(events.some((e) => e.action === "APPROVE")).toBe(true);

    const released = await releaseApprovedCampaign(campaign.id, ownerId);
    expect(released.status).toBe("READY_FOR_DISTRIBUTION");
  });

  it("market release still does not mean published or distributed", async () => {
    const campaign = await createCampaignFromOpportunity(
      {
        opportunityId,
        name: `Terminal check ${randomUUID()}`,
        objective: "Test",
        targetAudience: "Testers",
        positioningAngle: "Agreement-led",
        coreMessage: "Money should follow the agreement.",
        cta: "Learn more",
      },
      ownerId
    );
    await runCampaignBrandGuardian(campaign.id, ownerId);
    const approved = await reviewCampaign(campaign.id, "APPROVE", ownerId);
    expect(approved?.status).toBe("APPROVED");

    const released = await releaseApprovedCampaign(campaign.id, ownerId);
    expect(released.status).toBe("READY_FOR_DISTRIBUTION");
    expect(released.status).not.toBe("PUBLISHED");
    expect(released.status).not.toBe("DISTRIBUTED");
  });
});

describe("creative variants", () => {
  let campaignId: string;
  let ownerId: string;

  beforeAll(async () => {
    ownerId = await getOwnerId();
    const signal = await createSignal({ title: `Creative source ${randomUUID()}`, summary: "x", signalType: "MANUAL" }, ownerId);
    const analysis = await analyzeSignalAndCreateOpportunity(signal.id, ownerId);
    if (!analysis.ok) throw new Error("setup failed");
    await reviewOpportunity(analysis.opportunity.id, "APPROVE", ownerId);
    const campaign = await createCampaignFromOpportunity(
      {
        opportunityId: analysis.opportunity.id,
        name: `Creative test ${randomUUID()}`,
        objective: "Test",
        targetAudience: "Testers",
        positioningAngle: "Agreement-led",
        coreMessage: "Money should follow the agreement.",
        cta: "Learn more",
      },
      ownerId
    );
    campaignId = campaign.id;
  });

  it("generates at most 3 variants per generation action, each with headline/body/cta/imageConcept", async () => {
    const result = await generateVariantsForCampaign(campaignId, ownerId);
    expect(result.variants.length).toBeLessThanOrEqual(3);
    expect(result.variants.length).toBeGreaterThan(0);
    for (const v of result.variants) {
      expect(v.headline.length).toBeGreaterThan(0);
      expect(v.body.length).toBeGreaterThan(0);
      expect(v.cta.length).toBeGreaterThan(0);
      expect(v.imageConcept.length).toBeGreaterThan(0);
    }
  });

  it("works without live image generation — imageConcept is a text brief, not an image", async () => {
    const result = await generateVariantsForCampaign(campaignId, ownerId);
    for (const v of result.variants) {
      expect(typeof v.imageConcept).toBe("string");
      expect(v.imageConcept).not.toMatch(/^https?:\/\/.*\.(png|jpg|jpeg|webp)/i);
    }
  });
});

afterAll(async () => {
  // no explicit cleanup — this dev database is disposable/reseedable, same
  // convention as tests/db.test.ts.
});
