import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { assertNoProhibitedTargeting } from "./targeting-guard";
import { classifyAudience } from "@/lib/ai/tasks/analyze-audience";
import type { StructuredTaskResult } from "@/lib/ai/tasks/run-structured-task";
import type { AudienceClassification } from "@/lib/ai/tasks/analyze-audience";

export interface CreateAudienceSegmentInput {
  name: string;
  description: string;
  linkedCampaignId: string;
  sector?: string | null;
  geography?: string | null;
  businessCriteria?: string | null;
  roleFunctionCriteria?: string | null;
  companyCriteria?: string | null;
  intentCriteria?: string | null;
  channelEligibility?: string[];
  estimatedReach?: string | null;
  classification?: (typeof schema.classificationEnum.enumValues)[number];
  isDemo?: boolean;
}

function targetingFieldsOf(input: {
  description: string;
  sector?: string | null;
  geography?: string | null;
  businessCriteria?: string | null;
  roleFunctionCriteria?: string | null;
  companyCriteria?: string | null;
  intentCriteria?: string | null;
}) {
  return {
    description: input.description,
    sector: input.sector ?? "",
    geography: input.geography ?? "",
    businessCriteria: input.businessCriteria ?? "",
    roleFunctionCriteria: input.roleFunctionCriteria ?? "",
    companyCriteria: input.companyCriteria ?? "",
    intentCriteria: input.intentCriteria ?? "",
  };
}

// Audience segments may be defined for a campaign in any status (targeting
// can begin before READY_FOR_DISTRIBUTION — docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md
// Section 1's cycle diagram runs targeting alongside/after approval, not
// strictly after). Every free-text targeting field is checked against the
// sensitive-targeting guard before it is ever written, human-submitted or
// not — see src/lib/audience/targeting-guard.ts.
export async function createAudienceSegment(input: CreateAudienceSegmentInput, actorUserId: string) {
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, input.linkedCampaignId))
    .limit(1);
  if (!campaign) throw new Error("Campaign not found");

  assertNoProhibitedTargeting(targetingFieldsOf(input));

  const [row] = await db
    .insert(schema.audienceSegments)
    .values({
      name: input.name,
      description: input.description,
      linkedCampaignId: input.linkedCampaignId,
      sector: input.sector ?? null,
      geography: input.geography ?? null,
      businessCriteria: input.businessCriteria ?? null,
      roleFunctionCriteria: input.roleFunctionCriteria ?? null,
      companyCriteria: input.companyCriteria ?? null,
      intentCriteria: input.intentCriteria ?? null,
      channelEligibility: input.channelEligibility ?? [],
      estimatedReach: input.estimatedReach ?? null,
      classification: input.classification ?? "CONFIDENTIAL",
      isDemo: input.isDemo ?? campaign.isDemo,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "AUDIENCE_CREATED",
    actorUserId,
    targetType: "audience_segment",
    targetId: row!.id,
    metadata: { name: input.name, linkedCampaignId: input.linkedCampaignId, isDemo: row!.isDemo },
  });

  return row!;
}

export interface AudienceSegmentListFilters {
  status?: Array<(typeof schema.audienceSegmentStatusEnum.enumValues)[number]>;
  linkedCampaignId?: string;
}

export async function listAudienceSegments(filters: AudienceSegmentListFilters = {}) {
  const rows = await db.select().from(schema.audienceSegments).orderBy(desc(schema.audienceSegments.createdAt));
  return rows.filter((r) => {
    if (filters.status && !filters.status.includes(r.status)) return false;
    if (filters.linkedCampaignId && r.linkedCampaignId !== filters.linkedCampaignId) return false;
    return true;
  });
}

export async function getAudienceSegment(id: string) {
  const rows = await db.select().from(schema.audienceSegments).where(eq(schema.audienceSegments.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getAudienceScore(audienceSegmentId: string) {
  const rows = await db
    .select()
    .from(schema.audienceScores)
    .where(eq(schema.audienceScores.audienceSegmentId, audienceSegmentId))
    .limit(1);
  return rows[0] ?? null;
}

export interface UpdateAudienceSegmentInput {
  name?: string;
  description?: string;
  sector?: string | null;
  geography?: string | null;
  businessCriteria?: string | null;
  roleFunctionCriteria?: string | null;
  companyCriteria?: string | null;
  intentCriteria?: string | null;
  channelEligibility?: string[];
  estimatedReach?: string | null;
}

export async function updateAudienceSegment(id: string, input: UpdateAudienceSegmentInput) {
  const existing = await getAudienceSegment(id);
  if (!existing) return null;

  assertNoProhibitedTargeting(
    targetingFieldsOf({
      description: input.description ?? existing.description,
      sector: input.sector !== undefined ? input.sector : existing.sector,
      geography: input.geography !== undefined ? input.geography : existing.geography,
      businessCriteria: input.businessCriteria !== undefined ? input.businessCriteria : existing.businessCriteria,
      roleFunctionCriteria:
        input.roleFunctionCriteria !== undefined ? input.roleFunctionCriteria : existing.roleFunctionCriteria,
      companyCriteria: input.companyCriteria !== undefined ? input.companyCriteria : existing.companyCriteria,
      intentCriteria: input.intentCriteria !== undefined ? input.intentCriteria : existing.intentCriteria,
    })
  );

  const [row] = await db
    .update(schema.audienceSegments)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.audienceSegments.id, id))
    .returning();
  return row ?? null;
}

// Orchestrates AI classification → sensitive-targeting re-validation →
// score write, following src/lib/intelligence/opportunities.ts's
// analyzeSignalAndCreateOpportunity() shape exactly. Malformed/rejected AI
// output never mutates the segment — the caller (API route) surfaces the
// failure and allows a retry.
export async function classifyAudienceSegment(
  segmentId: string,
  actorUserId: string
): Promise<
  | { ok: true; segment: typeof schema.audienceSegments.$inferSelect }
  | { ok: false; result: StructuredTaskResult<AudienceClassification> }
  | { ok: false; rejected: true; reason: string }
> {
  const segment = await getAudienceSegment(segmentId);
  if (!segment) throw new Error("Audience segment not found");

  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, segment.linkedCampaignId)).limit(1);
  if (!campaign) throw new Error("Linked campaign not found");

  const result = await classifyAudience({
    campaign: {
      name: campaign.name,
      objective: campaign.objective,
      targetAudience: campaign.targetAudience,
      positioningAngle: campaign.positioningAngle,
    },
    segment: { name: segment.name, description: segment.description },
    requestedByUserId: actorUserId,
  });

  if (result.status !== "SUCCESS") {
    return { ok: false, result };
  }

  const analysis = result.data;

  // Never trust AI-proposed targeting fields verbatim — re-validate
  // server-side even though analyze-audience.ts's schema already forbids
  // free-form prohibited content; this is the deterministic backstop.
  try {
    assertNoProhibitedTargeting(targetingFieldsOf({ description: segment.description, ...analysis.raw }));
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Prohibited targeting dimension detected in AI output.";
    return { ok: false, rejected: true, reason };
  }

  const [updated] = await db
    .update(schema.audienceSegments)
    .set({
      sector: analysis.raw.sector || segment.sector,
      geography: analysis.raw.geography || segment.geography,
      businessCriteria: analysis.raw.businessCriteria || segment.businessCriteria,
      roleFunctionCriteria: analysis.raw.roleFunctionCriteria || segment.roleFunctionCriteria,
      companyCriteria: analysis.raw.companyCriteria || segment.companyCriteria,
      intentCriteria: analysis.raw.intentCriteria || segment.intentCriteria,
      channelEligibility: analysis.raw.suggestedChannels,
      status: "NEEDS_REVIEW",
      updatedAt: new Date(),
    })
    .where(eq(schema.audienceSegments.id, segmentId))
    .returning();

  await db
    .insert(schema.audienceScores)
    .values({
      audienceSegmentId: segmentId,
      problemFit: analysis.scoreComponents.problemFit,
      productFit: analysis.scoreComponents.productFit,
      intent: analysis.scoreComponents.intent,
      reachability: analysis.scoreComponents.reachability,
      commercialValue: analysis.scoreComponents.commercialValue,
      evidenceStrength: analysis.scoreComponents.evidenceStrength,
      totalScore: analysis.totalScore,
      explanation: analysis.explanation,
      aiProposed: true,
      scoredByUserId: actorUserId,
    })
    .onConflictDoUpdate({
      target: schema.audienceScores.audienceSegmentId,
      set: {
        problemFit: analysis.scoreComponents.problemFit,
        productFit: analysis.scoreComponents.productFit,
        intent: analysis.scoreComponents.intent,
        reachability: analysis.scoreComponents.reachability,
        commercialValue: analysis.scoreComponents.commercialValue,
        evidenceStrength: analysis.scoreComponents.evidenceStrength,
        totalScore: analysis.totalScore,
        explanation: analysis.explanation,
        aiProposed: true,
        scoredByUserId: actorUserId,
        createdAt: new Date(),
      },
    });

  await recordAuditEvent({
    eventType: "AUDIENCE_CLASSIFIED",
    actorUserId,
    targetType: "audience_segment",
    targetId: segmentId,
    metadata: { provider: analysis.provider, model: analysis.model, isMock: analysis.isMock, totalScore: analysis.totalScore },
  });

  return { ok: true, segment: updated! };
}

export type AudienceReviewAction = "APPROVE" | "REJECT" | "ARCHIVE";

// Owner-only — enforced by the caller via requireApiCapability, per the
// literal docs/ACCESS_CONTROL_MODEL.md Section 4 audience grant (only OWNER
// has create/edit/approve; everyone else is view-only). See
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md's RBAC reading-decision note.
export async function reviewAudienceSegment(
  id: string,
  action: AudienceReviewAction,
  actorUserId: string,
  notes?: string
) {
  const status = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "ARCHIVED";

  const [row] = await db
    .update(schema.audienceSegments)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.audienceSegments.id, id))
    .returning();

  await db.insert(schema.approvalEvents).values({
    subjectType: "audience_segment",
    subjectId: id,
    action: action === "APPROVE" ? "APPROVE" : action === "REJECT" ? "REJECT" : "REVISION_REQUESTED",
    actorUserId,
    notes: notes ?? null,
  });

  await recordAuditEvent({
    eventType: "AUDIENCE_REVIEWED",
    actorUserId,
    targetType: "audience_segment",
    targetId: id,
    metadata: { action, status },
  });

  return row ?? null;
}
