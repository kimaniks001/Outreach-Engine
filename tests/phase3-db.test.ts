import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { createSignal } from "@/lib/intelligence/signals";
import { analyzeSignalAndCreateOpportunity, reviewOpportunity } from "@/lib/intelligence/opportunities";
import { createCampaignFromOpportunity, runCampaignBrandGuardian, reviewCampaign } from "@/lib/campaigns/campaigns";
import { createAudienceSegment, reviewAudienceSegment } from "@/lib/audience/segments";
import { ProhibitedTargetingError } from "@/lib/audience/targeting-guard";
import {
  createDistributionPlan,
  updateDistributionPlan,
  runDistributionPlanBrandGuardian,
  reviewDistributionPlan,
  markDistributionPlanReady,
  PlanNotReadyError,
} from "@/lib/distribution/plans";
import { proposeBudget, approveBudget } from "@/lib/distribution/budget-guard";
import { DistributionGateway } from "@/lib/distribution/gateway";
import { getSafeMode, setSafeMode } from "@/lib/safe-mode/state";

// Integration tests against a real Postgres instance, same convention as
// tests/phase2-db.test.ts. Requires `npm run db:migrate` and
// `npm run db:seed` already run.

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

// Drives a fresh campaign to READY_FOR_DISTRIBUTION via the real Phase 2
// service functions, so Phase 3 tests build on a genuinely valid precondition
// rather than a shortcut insert.
async function createReadyCampaign(ownerId: string) {
  const signal = await createSignal(
    { title: `Phase 3 source signal ${randomUUID()}`, summary: "x", signalType: "MANUAL" },
    ownerId
  );
  const analysis = await analyzeSignalAndCreateOpportunity(signal.id, ownerId);
  if (!analysis.ok) throw new Error("setup: analysis failed");
  await reviewOpportunity(analysis.opportunity.id, "APPROVE", ownerId);
  const campaign = await createCampaignFromOpportunity(
    {
      opportunityId: analysis.opportunity.id,
      name: `Phase 3 campaign ${randomUUID()}`,
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
  if (approved?.status !== "READY_FOR_DISTRIBUTION") throw new Error("setup: campaign not READY_FOR_DISTRIBUTION");
  return approved;
}

async function createApprovedAudience(ownerId: string, campaignId: string) {
  const segment = await createAudienceSegment(
    {
      name: `Phase 3 audience ${randomUUID()}`,
      description: "Test segment",
      linkedCampaignId: campaignId,
      sector: "Construction",
      geography: "Kenya",
      intentCriteria: "Managing milestone-based contractor payments",
    },
    ownerId
  );
  return reviewAudienceSegment(segment.id, "APPROVE", ownerId);
}

describe("audience segments: sensitive-targeting rejection", () => {
  it("rejects a prohibited targeting dimension even when explicitly submitted", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    await expect(
      createAudienceSegment(
        {
          name: `Should fail ${randomUUID()}`,
          description: "x",
          linkedCampaignId: campaign.id,
          intentCriteria: "Target Christian homeowners",
        },
        ownerId
      )
    ).rejects.toThrow(ProhibitedTargetingError);
  });

  it("a clean commercial-targeting submission is created and can be approved", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const approved = await createApprovedAudience(ownerId, campaign.id);
    expect(approved?.status).toBe("APPROVED");
  });
});

describe("distribution plans: creation requires an APPROVED audience segment", () => {
  it("cannot create a plan from a non-approved audience segment", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const draftSegment = await createAudienceSegment(
      { name: `Draft segment ${randomUUID()}`, description: "x", linkedCampaignId: campaign.id },
      ownerId
    );

    await expect(
      createDistributionPlan(
        {
          campaignId: campaign.id,
          audienceSegmentId: draftSegment.id,
          objective: "Test",
          channel: "GOOGLE_SEARCH",
          channelStrategy: "Test strategy",
          cta: "Learn more",
        },
        ownerId
      )
    ).rejects.toThrow();
  });
});

describe("Brand Guardian gate: no distribution plan may become READY without a passing review", () => {
  it("a BLOCKed plan cannot be approved or marked READY", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const segment = await createApprovedAudience(ownerId, campaign.id);

    const plan = await createDistributionPlan(
      {
        campaignId: campaign.id,
        audienceSegmentId: segment!.id,
        objective: "Test",
        channel: "GOOGLE_SEARCH",
        channelStrategy: "SecurePay is an escrow wallet.", // deliberately violates positioning
        cta: "Get the wallet",
      },
      ownerId
    );

    const outcome = await runDistributionPlanBrandGuardian(plan.id, ownerId);
    expect(outcome.result).toBe("BLOCK");

    await expect(reviewDistributionPlan(plan.id, "APPROVE", ownerId)).rejects.toThrow();
  });

  it("a PASSed plan can be approved but still cannot become READY without an approved budget", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const segment = await createApprovedAudience(ownerId, campaign.id);

    const plan = await createDistributionPlan(
      {
        campaignId: campaign.id,
        audienceSegmentId: segment!.id,
        objective: "Test",
        channel: "GOOGLE_SEARCH",
        channelStrategy: "Agree on the milestone. Let the money follow.",
        cta: "Learn more",
      },
      ownerId
    );

    await runDistributionPlanBrandGuardian(plan.id, ownerId);
    const approved = await reviewDistributionPlan(plan.id, "APPROVE", ownerId);
    expect(approved?.status).toBe("APPROVED");

    await expect(markDistributionPlanReady(plan.id, ownerId)).rejects.toThrow(PlanNotReadyError);
  });
});

describe("budget guard", () => {
  it("no launch without an approved budget", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const segment = await createApprovedAudience(ownerId, campaign.id);
    const plan = await createDistributionPlan(
      {
        campaignId: campaign.id,
        audienceSegmentId: segment!.id,
        objective: "Test",
        channel: "GOOGLE_SEARCH",
        channelStrategy: "Agree on the milestone. Let the money follow.",
        cta: "Learn more",
      },
      ownerId
    );
    await runDistributionPlanBrandGuardian(plan.id, ownerId);
    await reviewDistributionPlan(plan.id, "APPROVE", ownerId);

    await expect(markDistributionPlanReady(plan.id, ownerId)).rejects.toThrow(PlanNotReadyError);
  });

  it("approved budget cannot exceed the total cap", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const segment = await createApprovedAudience(ownerId, campaign.id);
    const plan = await createDistributionPlan(
      {
        campaignId: campaign.id,
        audienceSegmentId: segment!.id,
        objective: "Test",
        channel: "GOOGLE_SEARCH",
        channelStrategy: "Agree on the milestone. Let the money follow.",
        cta: "Learn more",
      },
      ownerId
    );
    await proposeBudget({ distributionPlanId: plan.id, plannedBudget: 500, currency: "USD", totalCap: 100 }, ownerId);
    await expect(approveBudget(plan.id, ownerId, 500)).rejects.toThrow();
  });

  it("negative remaining/negative budgets are impossible", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const segment = await createApprovedAudience(ownerId, campaign.id);
    const plan = await createDistributionPlan(
      {
        campaignId: campaign.id,
        audienceSegmentId: segment!.id,
        objective: "Test",
        channel: "GOOGLE_SEARCH",
        channelStrategy: "Agree on the milestone. Let the money follow.",
        cta: "Learn more",
      },
      ownerId
    );
    await expect(proposeBudget({ distributionPlanId: plan.id, plannedBudget: -10, currency: "USD" }, ownerId)).rejects.toThrow();
  });

  it("a budget change after approval requires re-approval before another launch", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const segment = await createApprovedAudience(ownerId, campaign.id);
    const plan = await createDistributionPlan(
      {
        campaignId: campaign.id,
        audienceSegmentId: segment!.id,
        objective: "Test",
        channel: "GOOGLE_SEARCH",
        channelStrategy: "Agree on the milestone. Let the money follow.",
        cta: "Learn more",
      },
      ownerId
    );
    await proposeBudget({ distributionPlanId: plan.id, plannedBudget: 100, currency: "USD" }, ownerId);
    await approveBudget(plan.id, ownerId);
    await runDistributionPlanBrandGuardian(plan.id, ownerId);
    await reviewDistributionPlan(plan.id, "APPROVE", ownerId);

    // Propose a new budget on an APPROVED plan — must revert to
    // AWAITING_APPROVAL, not silently keep the old approval alive.
    await proposeBudget({ distributionPlanId: plan.id, plannedBudget: 150, currency: "USD" }, ownerId);
    const [reset] = await db.select().from(schema.distributionPlans).where(eq(schema.distributionPlans.id, plan.id)).limit(1);
    expect(reset!.status).toBe("AWAITING_APPROVAL");

    // The plan reverted to AWAITING_APPROVAL (re-approval required) — it
    // can no longer be marked READY until it is re-approved.
    await expect(markDistributionPlanReady(plan.id, ownerId)).rejects.toThrow(PlanNotReadyError);
  });
});

describe("execution: preconditions, Safe Mode, and audit", () => {
  async function buildReadyPlan(ownerId: string) {
    const campaign = await createReadyCampaign(ownerId);
    const segment = await createApprovedAudience(ownerId, campaign.id);
    const plan = await createDistributionPlan(
      {
        campaignId: campaign.id,
        audienceSegmentId: segment!.id,
        objective: "Test",
        channel: "GOOGLE_SEARCH",
        channelStrategy: "Agree on the milestone. Let the money follow.",
        cta: "Learn more",
      },
      ownerId
    );
    await updateDistributionPlan(plan.id, { executionMode: "SIMULATED" });
    await proposeBudget({ distributionPlanId: plan.id, plannedBudget: 100, currency: "USD" }, ownerId);
    await approveBudget(plan.id, ownerId);
    await runDistributionPlanBrandGuardian(plan.id, ownerId);
    await reviewDistributionPlan(plan.id, "APPROVE", ownerId);
    return markDistributionPlanReady(plan.id, ownerId);
  }

  it("a plan must be READY before it can launch", async () => {
    const ownerId = await getOwnerId();
    const campaign = await createReadyCampaign(ownerId);
    const segment = await createApprovedAudience(ownerId, campaign.id);
    const plan = await createDistributionPlan(
      {
        campaignId: campaign.id,
        audienceSegmentId: segment!.id,
        objective: "Test",
        channel: "GOOGLE_SEARCH",
        channelStrategy: "Agree on the milestone. Let the money follow.",
        cta: "Learn more",
      },
      ownerId
    );
    const outcome = await DistributionGateway.launch(plan.id, ownerId);
    expect(outcome.outcome).toBe("PLAN_NOT_READY");
  });

  it("a successful simulated launch is audited and creates an execution record with a real external id", async () => {
    const ownerId = await getOwnerId();
    const plan = await buildReadyPlan(ownerId);
    const outcome = await DistributionGateway.launch(plan!.id, ownerId);
    expect(outcome.outcome).toBe("LAUNCHED");
    if (outcome.outcome !== "LAUNCHED") return;

    expect(outcome.externalExecutionId).toMatch(/^sim_/);

    const [execution] = await db
      .select()
      .from(schema.distributionExecutions)
      .where(eq(schema.distributionExecutions.id, outcome.executionId))
      .limit(1);
    expect(execution!.isSimulated).toBe(true);
    expect(execution!.status).toBe("RUNNING");

    const [planRow] = await db.select().from(schema.distributionPlans).where(eq(schema.distributionPlans.id, plan!.id)).limit(1);
    expect(planRow!.status).toBe("RUNNING");

    const events = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.targetId, plan!.id));
    expect(events.some((e) => e.eventType === "EXECUTION_STARTED")).toBe(true);
  });

  it("Safe Mode blocks execution but not planning", async () => {
    const ownerId = await getOwnerId();
    const plan = await buildReadyPlan(ownerId);

    const previousMode = await getSafeMode();
    await setSafeMode("SAFE_MODE", ownerId);
    try {
      const outcome = await DistributionGateway.launch(plan!.id, ownerId);
      expect(outcome.outcome).toBe("SAFE_MODE_BLOCKED");

      // Planning/editing remains allowed while Safe Mode is active.
      const updated = await updateDistributionPlan(plan!.id, { objective: "Updated while Safe Mode is active" });
      expect(updated?.objective).toBe("Updated while Safe Mode is active");

      const events = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.targetId, plan!.id));
      expect(events.some((e) => e.eventType === "SAFE_MODE_BLOCKED_EXECUTION")).toBe(true);
    } finally {
      await setSafeMode(previousMode, ownerId);
    }
  });
});

afterAll(async () => {
  // no explicit cleanup — this dev database is disposable/reseedable, same
  // convention as tests/phase2-db.test.ts.
});
