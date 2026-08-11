import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { runBrandGuardian } from "@/lib/brand-guardian";
import { assertBudgetApprovedForLaunch, BudgetNotApprovedError } from "./budget-guard";

export interface CreateDistributionPlanInput {
  campaignId: string;
  audienceSegmentId: string;
  objective: string;
  channel: (typeof schema.channelTypeEnum.enumValues)[number];
  channelStrategy: string;
  creativeVariantIds?: string[];
  destination?: string | null;
  cta: string;
  plannedBudget?: number | null;
  budgetCurrency?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  providerAccountReference?: string | null;
}

// A distribution plan may only be created against an APPROVED audience
// segment — docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md's RBAC reading
// decision (the "approved scope" DISTRIBUTION_SALES' grant names). The
// campaign itself does not need to be READY_FOR_DISTRIBUTION yet — Section
// 1's cycle diagram runs targeting/planning alongside approval.
export async function createDistributionPlan(input: CreateDistributionPlanInput, actorUserId: string) {
  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, input.campaignId)).limit(1);
  if (!campaign) throw new Error("Campaign not found");

  const [segment] = await db
    .select()
    .from(schema.audienceSegments)
    .where(eq(schema.audienceSegments.id, input.audienceSegmentId))
    .limit(1);
  if (!segment) throw new Error("Audience segment not found");
  if (segment.status !== "APPROVED") {
    throw new Error("Distribution plans can only be created from an APPROVED audience segment.");
  }

  const [plan] = await db
    .insert(schema.distributionPlans)
    .values({
      campaignId: input.campaignId,
      audienceSegmentId: input.audienceSegmentId,
      objective: input.objective,
      channel: input.channel,
      channelStrategy: input.channelStrategy,
      creativeVariantIds: input.creativeVariantIds ?? [],
      destination: input.destination ?? null,
      cta: input.cta,
      plannedBudget: input.plannedBudget !== undefined && input.plannedBudget !== null ? String(input.plannedBudget) : null,
      budgetCurrency: input.budgetCurrency ?? "USD",
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      providerAccountReference: input.providerAccountReference ?? null,
      status: "DRAFT",
      executionMode: "PLAN_ONLY",
      riskLevel: "HIGH",
      isDemo: campaign.isDemo || segment.isDemo,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "DISTRIBUTION_PLAN_CREATED",
    actorUserId,
    targetType: "distribution_plan",
    targetId: plan!.id,
    metadata: { campaignId: input.campaignId, audienceSegmentId: input.audienceSegmentId, channel: input.channel },
  });

  return plan!;
}

export interface DistributionPlanListFilters {
  status?: Array<(typeof schema.distributionPlanStatusEnum.enumValues)[number]>;
  campaignId?: string;
}

export async function listDistributionPlans(filters: DistributionPlanListFilters = {}) {
  const rows = await db.select().from(schema.distributionPlans).orderBy(desc(schema.distributionPlans.createdAt));
  return rows.filter((r) => {
    if (filters.status && !filters.status.includes(r.status)) return false;
    if (filters.campaignId && r.campaignId !== filters.campaignId) return false;
    return true;
  });
}

export async function getDistributionPlan(id: string) {
  const rows = await db.select().from(schema.distributionPlans).where(eq(schema.distributionPlans.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface UpdateDistributionPlanInput {
  objective?: string;
  channel?: (typeof schema.channelTypeEnum.enumValues)[number];
  channelStrategy?: string;
  creativeVariantIds?: string[];
  destination?: string | null;
  cta?: string;
  executionMode?: (typeof schema.executionModeEnum.enumValues)[number];
  startDate?: Date | null;
  endDate?: Date | null;
  providerAccountReference?: string | null;
}

// Edits are blocked once a plan is RUNNING — pause it first. Any edit to a
// previously brand-reviewed plan resets brandGuardianStatus so a stale PASS
// can never be reused against changed copy.
export async function updateDistributionPlan(id: string, input: UpdateDistributionPlanInput) {
  const existing = await getDistributionPlan(id);
  if (!existing) return null;
  if (existing.status === "RUNNING") {
    throw new Error("Cannot edit a RUNNING distribution plan — pause it first.");
  }

  const touchesReviewedCopy = input.channelStrategy !== undefined || input.cta !== undefined || input.destination !== undefined;

  const [row] = await db
    .update(schema.distributionPlans)
    .set({
      ...input,
      status: touchesReviewedCopy && existing.brandGuardianStatus !== "NOT_REVIEWED" ? "DRAFT" : existing.status,
      brandGuardianStatus: touchesReviewedCopy ? "NOT_REVIEWED" : existing.brandGuardianStatus,
      updatedAt: new Date(),
    })
    .where(eq(schema.distributionPlans.id, id))
    .returning();
  return row ?? null;
}

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Sections 25-26 — channel-
// adapted creative copy (channelStrategy/cta/destination) must itself pass
// Brand Guardian before the plan can become executable. The deterministic
// rule engine result is always authoritative, same discipline as
// src/lib/campaigns/campaigns.ts::runCampaignBrandGuardian.
export async function runDistributionPlanBrandGuardian(planId: string, actorUserId: string) {
  const plan = await getDistributionPlan(planId);
  if (!plan) throw new Error("Distribution plan not found");

  const outcome = await runBrandGuardian({
    fields: {
      channelStrategy: plan.channelStrategy,
      cta: plan.cta,
      destination: plan.destination ?? "",
    },
    requestedByUserId: actorUserId,
  });

  await db.insert(schema.brandReviews).values({
    subjectType: "distribution_plan",
    subjectId: planId,
    result: outcome.result,
    reasons: outcome.reasons,
    offendingStatements: outcome.offendingStatements,
    recommendedCorrection: outcome.recommendedCorrection,
    doctrineReferences: outcome.doctrineReferences,
    ruleEngineVersion: outcome.ruleEngineVersion,
    aiEnrichmentUsed: outcome.aiEnrichmentUsed,
    aiUsageRecordId: outcome.aiUsageRecordId,
    requestedByUserId: actorUserId,
  });

  const nextStatus = outcome.result === "PASS" ? "AWAITING_APPROVAL" : "NEEDS_REVIEW";

  await db
    .update(schema.distributionPlans)
    .set({ brandGuardianStatus: outcome.result, status: nextStatus, updatedAt: new Date() })
    .where(eq(schema.distributionPlans.id, planId));

  await recordAuditEvent({
    eventType: "DISTRIBUTION_PLAN_BRAND_REVIEWED",
    actorUserId,
    targetType: "distribution_plan",
    targetId: planId,
    metadata: { result: outcome.result },
  });

  return outcome;
}

export type DistributionPlanReviewAction = "APPROVE" | "REJECT";

// Owner-only — enforced by the caller via requireApiCapability("approve",
// "distribution"), per the literal grant table: GROWTH_DIRECTOR has
// view-only on `distribution` (no approve), unlike campaigns. See
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md's RBAC reading-decision note.
export async function reviewDistributionPlan(
  planId: string,
  action: DistributionPlanReviewAction,
  actorUserId: string,
  notes?: string
) {
  const plan = await getDistributionPlan(planId);
  if (!plan) throw new Error("Distribution plan not found");

  if (action === "APPROVE") {
    if (plan.brandGuardianStatus !== "PASS") {
      throw new Error("Distribution plan cannot be approved without a passing Brand Guardian review.");
    }
    if (plan.status !== "AWAITING_APPROVAL") {
      throw new Error(`Plan is not awaiting approval (current status: ${plan.status}).`);
    }
  }

  const nextStatus = action === "APPROVE" ? "APPROVED" : "CANCELLED";

  const [row] = await db
    .update(schema.distributionPlans)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(schema.distributionPlans.id, planId))
    .returning();

  await db.insert(schema.approvalEvents).values({
    subjectType: "distribution_plan",
    subjectId: planId,
    action: action === "APPROVE" ? "APPROVE" : "REJECT",
    actorUserId,
    notes: notes ?? null,
  });

  await recordAuditEvent({
    eventType: "DISTRIBUTION_PLAN_REVIEWED",
    actorUserId,
    targetType: "distribution_plan",
    targetId: planId,
    metadata: { action, status: nextStatus },
  });

  return row ?? null;
}

export class PlanNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanNotReadyError";
  }
}

// The gate immediately before execution becomes possible — every
// precondition in docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Sections 8/13/
// 26 is checked here, server-side: plan APPROVED, Brand Guardian PASS on the
// plan's own channel-adapted copy, every referenced creative_variant itself
// PASS, and an APPROVED budget. Owner-only, same capability as approval.
export async function markDistributionPlanReady(planId: string, actorUserId: string) {
  const plan = await getDistributionPlan(planId);
  if (!plan) throw new Error("Distribution plan not found");

  if (plan.status !== "APPROVED") {
    throw new PlanNotReadyError(`Plan status is ${plan.status}; it must be APPROVED before it can become READY.`);
  }
  if (plan.brandGuardianStatus !== "PASS") {
    throw new PlanNotReadyError("Distribution plan's channel-adapted copy has not passed Brand Guardian.");
  }

  if (plan.creativeVariantIds.length > 0) {
    const variants = await db
      .select()
      .from(schema.creativeVariants)
      .where(inArray(schema.creativeVariants.id, plan.creativeVariantIds));
    const notPassed = variants.filter((v) => v.brandGuardianStatus !== "PASS");
    if (notPassed.length > 0 || variants.length !== plan.creativeVariantIds.length) {
      throw new PlanNotReadyError(
        "Every creative variant referenced by this plan must have a passing Brand Guardian review."
      );
    }
  }

  try {
    await assertBudgetApprovedForLaunch(planId);
  } catch (err) {
    if (err instanceof BudgetNotApprovedError) {
      throw new PlanNotReadyError(err.message);
    }
    throw err;
  }

  const [row] = await db
    .update(schema.distributionPlans)
    .set({ status: "READY", updatedAt: new Date() })
    .where(eq(schema.distributionPlans.id, planId))
    .returning();

  await recordAuditEvent({
    eventType: "DISTRIBUTION_PLAN_REVIEWED",
    actorUserId,
    targetType: "distribution_plan",
    targetId: planId,
    metadata: { action: "MARK_READY", status: "READY" },
  });

  return row ?? null;
}

export async function listApprovalHistory(subjectId: string) {
  return db
    .select()
    .from(schema.approvalEvents)
    .where(eq(schema.approvalEvents.subjectId, subjectId))
    .orderBy(desc(schema.approvalEvents.createdAt))
    .then((rows) => rows.filter((r) => r.subjectType === "distribution_plan"));
}
