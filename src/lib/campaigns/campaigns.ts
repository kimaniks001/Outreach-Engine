import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { runBrandGuardian } from "@/lib/brand-guardian";

export interface CreateCampaignInput {
  opportunityId: string;
  name: string;
  objective: string;
  targetAudience: string;
  positioningAngle: string;
  coreMessage: string;
  recommendedChannelTypes?: string[];
  cta: string;
  destinationConcept?: string | null;
  creativeBrief?: string | null;
}

// Campaigns may only be created from an APPROVED opportunity — this is the
// human-approval gate between "conclusion" and "commercial action" per
// docs/OUTREACH_ENGINE_DOCTRINE.md Section 3 ("evidence before action").
export async function createCampaignFromOpportunity(input: CreateCampaignInput, actorUserId: string) {
  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(eq(schema.opportunities.id, input.opportunityId))
    .limit(1);

  if (!opportunity) throw new Error("Opportunity not found");
  if (opportunity.status !== "APPROVED") {
    throw new Error("Campaigns can only be created from an APPROVED opportunity.");
  }

  const [campaign] = await db
    .insert(schema.campaigns)
    .values({
      opportunityId: input.opportunityId,
      name: input.name,
      objective: input.objective,
      targetAudience: input.targetAudience,
      positioningAngle: input.positioningAngle,
      coreMessage: input.coreMessage,
      recommendedChannelTypes: input.recommendedChannelTypes ?? [],
      cta: input.cta,
      destinationConcept: input.destinationConcept ?? null,
      creativeBrief: input.creativeBrief ?? null,
      riskLevel: "HIGH",
      status: "DRAFT",
      isDemo: opportunity.isDemo,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "CAMPAIGN_CREATED",
    actorUserId,
    targetType: "campaign",
    targetId: campaign!.id,
    metadata: { opportunityId: input.opportunityId, name: input.name },
  });

  return campaign!;
}

export async function listCampaigns() {
  return db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.createdAt));
}

export async function getCampaign(id: string) {
  const rows = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface UpdateCampaignStrategyInput {
  name?: string;
  objective?: string;
  targetAudience?: string;
  positioningAngle?: string;
  coreMessage?: string;
  recommendedChannelTypes?: string[];
  cta?: string;
  destinationConcept?: string | null;
  creativeBrief?: string | null;
}

// Any market-facing content edit invalidates the previous review chain. The
// append-only approval/release evidence remains for audit, but the mutable
// campaign returns to DRAFT and must pass Brand Guardian + human gates again.
export async function updateCampaignStrategy(id: string, input: UpdateCampaignStrategyInput) {
  const [row] = await db
    .update(schema.campaigns)
    .set({
      ...input,
      brandGuardianStatus: "NOT_REVIEWED",
      status: "DRAFT",
      updatedAt: new Date(),
    })
    .where(eq(schema.campaigns.id, id))
    .returning();
  return row ?? null;
}

// The deterministic rule-engine result is always authoritative. PASS moves
// the campaign to AWAITING_APPROVAL, but that is only the start of the human
// approval chain; it is not permission to distribute.
export async function runCampaignBrandGuardian(campaignId: string, actorUserId: string) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const outcome = await runBrandGuardian({
    fields: {
      coreMessage: campaign.coreMessage,
      positioningAngle: campaign.positioningAngle,
      cta: campaign.cta,
      creativeBrief: campaign.creativeBrief ?? "",
    },
    requestedByUserId: actorUserId,
  });

  await db.insert(schema.brandReviews).values({
    subjectType: "campaign",
    subjectId: campaignId,
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

  const nextStatus = outcome.result === "PASS" ? "AWAITING_APPROVAL" : "NEEDS_REVISION";

  await db
    .update(schema.campaigns)
    .set({ brandGuardianStatus: outcome.result, status: nextStatus, updatedAt: new Date() })
    .where(eq(schema.campaigns.id, campaignId));

  await recordAuditEvent({
    eventType: "CAMPAIGN_BRAND_REVIEWED",
    actorUserId,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { result: outcome.result },
  });

  return outcome;
}

export type CampaignReviewAction = "APPROVE" | "REJECT" | "REVISION_REQUESTED";

// Legacy campaign-review helper retained for existing callers. An APPROVE
// can now move only to APPROVED — never READY_FOR_DISTRIBUTION. The Phase 2
// market-release authority requires sourced Brand & Claims evidence plus
// Compliance/Legal where required before a separate final release.
export async function reviewCampaign(
  campaignId: string,
  action: CampaignReviewAction,
  actorUserId: string,
  notes?: string
) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");

  if (action === "APPROVE") {
    if (campaign.brandGuardianStatus !== "PASS") {
      throw new Error("Campaign cannot be approved without a passing Brand Guardian review.");
    }
    if (campaign.status !== "AWAITING_APPROVAL") {
      throw new Error(`Campaign is not awaiting approval (current status: ${campaign.status}).`);
    }
  }

  const nextStatus =
    action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "NEEDS_REVISION";

  const [row] = await db
    .update(schema.campaigns)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(schema.campaigns.id, campaignId))
    .returning();

  await db.insert(schema.approvalEvents).values({
    subjectType: "campaign",
    subjectId: campaignId,
    action,
    actorUserId,
    notes: notes ?? null,
  });

  await recordAuditEvent({
    eventType: "CAMPAIGN_REVIEWED",
    actorUserId,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { action, status: nextStatus },
  });

  return row ?? null;
}

export async function listApprovalHistory(subjectType: "opportunity" | "campaign", subjectId: string) {
  return db
    .select()
    .from(schema.approvalEvents)
    .where(eq(schema.approvalEvents.subjectId, subjectId))
    .orderBy(desc(schema.approvalEvents.createdAt))
    .then((rows) => rows.filter((r) => r.subjectType === subjectType));
}

export async function listBrandReviews(subjectType: "campaign" | "creative_variant", subjectId: string) {
  return db
    .select()
    .from(schema.brandReviews)
    .where(eq(schema.brandReviews.subjectId, subjectId))
    .orderBy(desc(schema.brandReviews.createdAt))
    .then((rows) => rows.filter((r) => r.subjectType === subjectType));
}
