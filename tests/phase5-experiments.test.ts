import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { createSignal } from "@/lib/intelligence/signals";
import { analyzeSignalAndCreateOpportunity, reviewOpportunity } from "@/lib/intelligence/opportunities";
import { createCampaignFromOpportunity, runCampaignBrandGuardian, reviewCampaign } from "@/lib/campaigns/campaigns";
import { createDistributionPlan } from "@/lib/distribution/plans";
import { createAudienceSegment, reviewAudienceSegment } from "@/lib/audience/segments";
import { createExperiment, addVariant, planExperiment, startExperiment, getExperiment } from "@/lib/experiments/experiments";
import { computeEvaluation, evaluateAndPersist, ExperimentEvaluationError } from "@/lib/experiments/evaluation";
import { createLearningFromExperiment } from "@/lib/learning/learnings";
import { resolveProfile } from "@/lib/commercial-memory/identity";
import { recordTouchpoint } from "@/lib/commercial-memory/touchpoints";
import { simulateProductEvent } from "@/lib/product-events/simulator";

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

async function readyCampaignWithSegment(ownerId: string) {
  const signal = await createSignal({ title: `Phase 5 experiment signal ${randomUUID()}`, summary: "x", signalType: "MANUAL" }, ownerId);
  const analysis = await analyzeSignalAndCreateOpportunity(signal.id, ownerId);
  if (!analysis.ok) throw new Error("setup: analysis failed");
  await reviewOpportunity(analysis.opportunity.id, "APPROVE", ownerId);
  const campaign = await createCampaignFromOpportunity(
    { opportunityId: analysis.opportunity.id, name: `Phase 5 experiment campaign ${randomUUID()}`, objective: "Test", targetAudience: "Testers", positioningAngle: "Agreement-led", coreMessage: "Money should follow the agreement.", cta: "Learn more" },
    ownerId
  );
  await runCampaignBrandGuardian(campaign.id, ownerId);
  await reviewCampaign(campaign.id, "APPROVE", ownerId);

  const segment = await createAudienceSegment({ name: `seg ${randomUUID()}`, description: "test", linkedCampaignId: campaign.id }, ownerId);
  await reviewAudienceSegment(segment.id, "APPROVE", ownerId);

  return { campaign, segment };
}

async function seedVariantLeads(planId: string, campaignId: string, n: number, convertCount: number) {
  for (let i = 0; i < n; i++) {
    const email = `${randomUUID()}@example.com`;
    const profile = await resolveProfile({ identifiers: { email }, source: "test", isDemo: true });
    await recordTouchpoint({ profileId: profile.id, campaignId, distributionPlanId: planId, type: "AD_IMPRESSION", isDemo: true });
    if (i < convertCount) {
      await simulateProductEvent({ productEventType: "SECURELINK_CREATED", profileRef: { email }, campaignId });
    }
  }
}

describe("experiment lifecycle", () => {
  it("moves DRAFT -> PLANNED -> RUNNING and rejects planning with fewer than 2 variants", async () => {
    const ownerId = await getOwnerId();
    const { campaign } = await readyCampaignWithSegment(ownerId);
    const experiment = await createExperiment(
      { name: `exp ${randomUUID()}`, hypothesis: "h", campaignId: campaign.id, primaryMetricType: "FIRST_SECURELINK", primaryMetric: "SecureLink rate", expectedOutcome: "x" },
      ownerId
    );
    expect(experiment.status).toBe("DRAFT");

    await expect(planExperiment(experiment.id)).rejects.toThrow();

    await addVariant({ experimentId: experiment.id, variantLabel: "A", isControl: true, messagingAngle: "control", cta: "go" });
    await addVariant({ experimentId: experiment.id, variantLabel: "B", isControl: false, messagingAngle: "challenger", cta: "go" });

    const planned = await planExperiment(experiment.id);
    expect(planned?.status).toBe("PLANNED");

    const started = await startExperiment(experiment.id, ownerId);
    expect(started?.status).toBe("RUNNING");
    expect(started?.startDate).not.toBeNull();
  });
});

describe("experiment evaluation: variant metrics, winner/inconclusive logic", () => {
  it("requires a real primaryMetricType before evaluating (Section 11 — not clicks alone)", async () => {
    const ownerId = await getOwnerId();
    const { campaign } = await readyCampaignWithSegment(ownerId);
    const experiment = await createExperiment(
      { name: `exp ${randomUUID()}`, hypothesis: "h", campaignId: campaign.id, primaryMetric: "clicks only", expectedOutcome: "x" },
      ownerId
    );
    await addVariant({ experimentId: experiment.id, variantLabel: "A", isControl: true, messagingAngle: "control", cta: "go" });
    await addVariant({ experimentId: experiment.id, variantLabel: "B", isControl: false, messagingAngle: "challenger", cta: "go" });

    await expect(computeEvaluation(experiment.id)).rejects.toThrow(ExperimentEvaluationError);
  });

  it("reports INSUFFICIENT_DATA confidence and no winner when sample sizes are too small", async () => {
    const ownerId = await getOwnerId();
    const { campaign, segment } = await readyCampaignWithSegment(ownerId);
    const planA = await createDistributionPlan({ campaignId: campaign.id, audienceSegmentId: segment.id, objective: "A", channel: "GOOGLE_SEARCH", channelStrategy: "s", cta: "go" }, ownerId);
    const planB = await createDistributionPlan({ campaignId: campaign.id, audienceSegmentId: segment.id, objective: "B", channel: "META_FACEBOOK", channelStrategy: "s", cta: "go" }, ownerId);

    const experiment = await createExperiment(
      { name: `exp ${randomUUID()}`, hypothesis: "h", campaignId: campaign.id, primaryMetricType: "FIRST_SECURELINK", primaryMetric: "SecureLink rate", expectedOutcome: "x" },
      ownerId
    );
    const variantA = await addVariant({ experimentId: experiment.id, variantLabel: "A", isControl: true, messagingAngle: "control", cta: "go", distributionPlanId: planA.id });
    await addVariant({ experimentId: experiment.id, variantLabel: "B", isControl: false, messagingAngle: "challenger", cta: "go", distributionPlanId: planB.id });
    await planExperiment(experiment.id);
    await startExperiment(experiment.id, ownerId);

    // Only 3 leads per variant — well under the sample floor.
    await seedVariantLeads(planA.id, campaign.id, 3, 1);
    await seedVariantLeads(planB.id, campaign.id, 3, 1);

    const outcome = await evaluateAndPersist(experiment.id, {});
    expect(outcome.status).toBe("INCONCLUSIVE");

    const finalExperiment = await getExperiment(experiment.id);
    expect(finalExperiment?.confidence).toBe("INSUFFICIENT_DATA");
    expect(finalExperiment?.winnerVariantId).toBeNull();
    void variantA;
  });

  it("declares a real winner with reproducible per-variant metrics when one variant clearly outperforms", async () => {
    const ownerId = await getOwnerId();
    const { campaign, segment } = await readyCampaignWithSegment(ownerId);
    const planA = await createDistributionPlan({ campaignId: campaign.id, audienceSegmentId: segment.id, objective: "A", channel: "GOOGLE_SEARCH", channelStrategy: "s", cta: "go" }, ownerId);
    const planB = await createDistributionPlan({ campaignId: campaign.id, audienceSegmentId: segment.id, objective: "B", channel: "META_FACEBOOK", channelStrategy: "s", cta: "go" }, ownerId);

    const experiment = await createExperiment(
      { name: `exp ${randomUUID()}`, hypothesis: "h", campaignId: campaign.id, primaryMetricType: "FIRST_SECURELINK", primaryMetric: "SecureLink rate", expectedOutcome: "x" },
      ownerId
    );
    const variantA = await addVariant({ experimentId: experiment.id, variantLabel: "A", isControl: false, messagingAngle: "challenger", cta: "go", distributionPlanId: planA.id });
    await addVariant({ experimentId: experiment.id, variantLabel: "B", isControl: true, messagingAngle: "control", cta: "go", distributionPlanId: planB.id });
    await planExperiment(experiment.id);
    await startExperiment(experiment.id, ownerId);

    await seedVariantLeads(planA.id, campaign.id, 22, 15); // ~68%
    await seedVariantLeads(planB.id, campaign.id, 22, 3); // ~14%

    const outcome = await evaluateAndPersist(experiment.id, {});
    expect(outcome.status).toBe("COMPLETED");
    expect(outcome.result.winnerVariantId).toBe(variantA.id);
    expect(outcome.result.perVariant).toHaveLength(2);

    const winnerMetric = outcome.result.perVariant.find((v) => v.variantId === variantA.id)!;
    expect(winnerMetric.sampleCount).toBe(22);
    expect(winnerMetric.primaryMetricCount).toBe(15);
  });
});

describe("learning creation from a completed experiment", () => {
  it("creates a learning referencing the experiment's real result, not a fabricated one", async () => {
    const ownerId = await getOwnerId();
    const { campaign, segment } = await readyCampaignWithSegment(ownerId);
    const planA = await createDistributionPlan({ campaignId: campaign.id, audienceSegmentId: segment.id, objective: "A", channel: "GOOGLE_SEARCH", channelStrategy: "s", cta: "go" }, ownerId);
    const planB = await createDistributionPlan({ campaignId: campaign.id, audienceSegmentId: segment.id, objective: "B", channel: "META_FACEBOOK", channelStrategy: "s", cta: "go" }, ownerId);

    const experiment = await createExperiment(
      { name: `exp ${randomUUID()}`, hypothesis: "milestone framing wins", campaignId: campaign.id, primaryMetricType: "FIRST_SECURELINK", primaryMetric: "SecureLink rate", expectedOutcome: "x" },
      ownerId
    );
    await addVariant({ experimentId: experiment.id, variantLabel: "A", isControl: false, messagingAngle: "challenger", cta: "go", distributionPlanId: planA.id });
    await addVariant({ experimentId: experiment.id, variantLabel: "B", isControl: true, messagingAngle: "control", cta: "go", distributionPlanId: planB.id });
    await planExperiment(experiment.id);
    await startExperiment(experiment.id, ownerId);
    await seedVariantLeads(planA.id, campaign.id, 22, 15);
    await seedVariantLeads(planB.id, campaign.id, 22, 3);
    await evaluateAndPersist(experiment.id, {});

    const learning = await createLearningFromExperiment(experiment.id, ownerId);
    expect(learning.sourceExperimentId).toBe(experiment.id);
    expect(learning.status).toBe("ACTIVE");
    expect(learning.conclusion).toContain("outperformed");
  });

  it("refuses to create a learning from an experiment that hasn't been evaluated", async () => {
    const ownerId = await getOwnerId();
    const { campaign } = await readyCampaignWithSegment(ownerId);
    const experiment = await createExperiment(
      { name: `exp ${randomUUID()}`, hypothesis: "h", campaignId: campaign.id, primaryMetricType: "FIRST_SECURELINK", primaryMetric: "SecureLink rate", expectedOutcome: "x" },
      ownerId
    );
    await expect(createLearningFromExperiment(experiment.id, ownerId)).rejects.toThrow();
  });
});
