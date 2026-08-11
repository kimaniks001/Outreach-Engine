import { and, desc, eq, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { getExperiment, listVariants } from "@/lib/experiments/experiments";
import { listExperimentResults } from "@/lib/experiments/experiments";

// Durable Commercial Learning records — Phase 5 brief Section 13. Purpose:
// prevent the engine (and Growth Director) from repeatedly relearning the
// same commercial lesson.

export interface CreateLearningInput {
  sourceExperimentId?: string | null;
  sourceCampaignId?: string | null;
  sourceOpportunityId?: string | null;
  observation: string;
  conclusion: string;
  evidence?: Record<string, unknown>;
  confidence: (typeof schema.evidenceConfidenceEnum.enumValues)[number];
  applicableAudienceSegmentId?: string | null;
  applicableSector?: string | null;
  applicableChannel?: (typeof schema.channelTypeEnum.enumValues)[number] | null;
  applicableProduct?: string | null;
  reviewAfter?: Date | null;
  isDemo?: boolean;
}

export async function createLearning(input: CreateLearningInput, actorUserId: string) {
  const [row] = await db
    .insert(schema.commercialLearnings)
    .values({
      sourceExperimentId: input.sourceExperimentId ?? null,
      sourceCampaignId: input.sourceCampaignId ?? null,
      sourceOpportunityId: input.sourceOpportunityId ?? null,
      observation: input.observation,
      conclusion: input.conclusion,
      evidence: input.evidence ?? {},
      confidence: input.confidence,
      applicableAudienceSegmentId: input.applicableAudienceSegmentId ?? null,
      applicableSector: input.applicableSector ?? null,
      applicableChannel: input.applicableChannel ?? null,
      applicableProduct: input.applicableProduct ?? null,
      reviewAfter: input.reviewAfter ?? null,
      status: "ACTIVE",
      isDemo: input.isDemo ?? false,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "LEARNING_CREATED",
    actorUserId,
    targetType: "commercial_learning",
    targetId: row!.id,
    metadata: { sourceExperimentId: input.sourceExperimentId ?? null, confidence: input.confidence },
  });

  return row!;
}

// Derives a learning directly from a completed experiment's latest result —
// the primary path this table is populated through. Never fabricates a
// conclusion beyond what evaluateAndPersist already computed.
export async function createLearningFromExperiment(experimentId: string, actorUserId: string) {
  const experiment = await getExperiment(experimentId);
  if (!experiment) throw new Error("Experiment not found");
  if (experiment.status !== "COMPLETED" && experiment.status !== "INCONCLUSIVE") {
    throw new Error(`Experiment is ${experiment.status}; only COMPLETED/INCONCLUSIVE experiments produce a learning.`);
  }

  const [latestResult] = await listExperimentResults(experimentId);
  if (!latestResult) throw new Error("Experiment has not been evaluated yet.");

  const variants = await listVariants(experimentId);
  const winnerLabel = latestResult.winnerVariantId
    ? variants.find((v) => v.id === latestResult.winnerVariantId)?.messagingAngle
    : null;

  const observation = `Experiment "${experiment.name}" tested: ${experiment.hypothesis}`;
  const conclusion = winnerLabel
    ? `"${winnerLabel}" outperformed the control on ${experiment.primaryMetric}. ${latestResult.interpretation}`
    : `No variant reliably outperformed the control on ${experiment.primaryMetric}. ${latestResult.interpretation}`;

  return createLearning(
    {
      sourceExperimentId: experimentId,
      sourceCampaignId: experiment.campaignId,
      sourceOpportunityId: experiment.opportunityId,
      observation,
      conclusion,
      evidence: { experimentResultId: latestResult.id, perVariant: latestResult.perVariant },
      confidence: latestResult.confidence,
      applicableAudienceSegmentId: experiment.audienceSegmentId,
      applicableChannel: experiment.channel,
      isDemo: experiment.isDemo,
    },
    actorUserId
  );
}

export async function getLearning(id: string) {
  const rows = await db.select().from(schema.commercialLearnings).where(eq(schema.commercialLearnings.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface ListLearningsFilters {
  status?: (typeof schema.learningStatusEnum.enumValues)[number];
  applicableChannel?: (typeof schema.channelTypeEnum.enumValues)[number];
  applicableSector?: string;
}

export async function listLearnings(filters: ListLearningsFilters = {}) {
  const rows = await db.select().from(schema.commercialLearnings).orderBy(desc(schema.commercialLearnings.learnedAt));
  return rows.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.applicableChannel && r.applicableChannel !== filters.applicableChannel) return false;
    if (filters.applicableSector && r.applicableSector !== filters.applicableSector) return false;
    return true;
  });
}

export async function supersedeLearning(oldLearningId: string, newLearningId: string, actorUserId: string) {
  const [row] = await db
    .update(schema.commercialLearnings)
    .set({ status: "SUPERSEDED", supersededByLearningId: newLearningId, updatedAt: new Date() })
    .where(eq(schema.commercialLearnings.id, oldLearningId))
    .returning();

  await recordAuditEvent({
    eventType: "LEARNING_SUPERSEDED",
    actorUserId,
    targetType: "commercial_learning",
    targetId: oldLearningId,
    metadata: { supersededByLearningId: newLearningId },
  });

  return row ?? null;
}

export async function rejectLearning(id: string, actorUserId: string) {
  const [row] = await db
    .update(schema.commercialLearnings)
    .set({ status: "REJECTED", updatedAt: new Date() })
    .where(eq(schema.commercialLearnings.id, id))
    .returning();
  return row ?? null;
}

// Deterministic on-demand sweep (no scheduler — see
// docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md Section 31): moves ACTIVE
// learnings whose reviewAfter has passed into NEEDS_REVIEW.
export async function sweepLearningsNeedingReview(now: Date = new Date()): Promise<string[]> {
  const due = await db
    .select({ id: schema.commercialLearnings.id })
    .from(schema.commercialLearnings)
    .where(and(eq(schema.commercialLearnings.status, "ACTIVE"), lte(schema.commercialLearnings.reviewAfter, now)));

  const ids = due.map((r) => r.id);
  if (ids.length > 0) {
    for (const id of ids) {
      await db.update(schema.commercialLearnings).set({ status: "NEEDS_REVIEW", updatedAt: new Date() }).where(eq(schema.commercialLearnings.id, id));
    }
  }
  return ids;
}
