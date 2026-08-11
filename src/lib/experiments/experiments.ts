import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

// Experiment domain — Phase 5 brief Sections 10-11. Each variant links to
// the real Phase 3 distribution plan that served it
// (experimentVariants.distributionPlanId) — evaluation
// (src/lib/experiments/evaluation.ts) reads real touchpoint/conversion
// history through that link rather than a parallel tracking system.

export type ExperimentStatus = (typeof schema.experimentStatusEnum.enumValues)[number];

export interface CreateExperimentInput {
  name: string;
  hypothesis: string;
  campaignId?: string | null;
  opportunityId?: string | null;
  audienceSegmentId?: string | null;
  channel?: (typeof schema.channelTypeEnum.enumValues)[number] | null;
  primaryMetricType?: (typeof schema.conversionTypeEnum.enumValues)[number] | null;
  primaryMetric: string;
  secondaryMetrics?: string[];
  expectedOutcome: string;
  isDemo?: boolean;
}

export async function createExperiment(input: CreateExperimentInput, actorUserId: string) {
  const [row] = await db
    .insert(schema.experiments)
    .values({
      name: input.name,
      hypothesis: input.hypothesis,
      campaignId: input.campaignId ?? null,
      opportunityId: input.opportunityId ?? null,
      audienceSegmentId: input.audienceSegmentId ?? null,
      channel: input.channel ?? null,
      primaryMetricType: input.primaryMetricType ?? null,
      primaryMetric: input.primaryMetric,
      secondaryMetrics: input.secondaryMetrics ?? [],
      expectedOutcome: input.expectedOutcome,
      status: "DRAFT",
      isDemo: input.isDemo ?? false,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "EXPERIMENT_CREATED",
    actorUserId,
    targetType: "experiment",
    targetId: row!.id,
    metadata: { name: input.name, isDemo: row!.isDemo },
  });

  return row!;
}

export interface AddVariantInput {
  experimentId: string;
  variantLabel: string;
  isControl?: boolean;
  messagingAngle: string;
  creativeVariantId?: string | null;
  cta: string;
  distributionPlanId?: string | null;
  description?: string | null;
}

export async function addVariant(input: AddVariantInput) {
  const [row] = await db
    .insert(schema.experimentVariants)
    .values({
      experimentId: input.experimentId,
      variantLabel: input.variantLabel,
      isControl: input.isControl ?? false,
      messagingAngle: input.messagingAngle,
      creativeVariantId: input.creativeVariantId ?? null,
      cta: input.cta,
      distributionPlanId: input.distributionPlanId ?? null,
      description: input.description ?? null,
    })
    .returning();
  return row!;
}

export async function getExperiment(id: string) {
  const rows = await db.select().from(schema.experiments).where(eq(schema.experiments.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listVariants(experimentId: string) {
  return db.select().from(schema.experimentVariants).where(eq(schema.experimentVariants.experimentId, experimentId));
}

export async function listExperimentResults(experimentId: string) {
  return db
    .select()
    .from(schema.experimentResults)
    .where(eq(schema.experimentResults.experimentId, experimentId))
    .orderBy(desc(schema.experimentResults.computedAt));
}

export interface ListExperimentsFilters {
  status?: ExperimentStatus;
  campaignId?: string;
}

export async function listExperiments(filters: ListExperimentsFilters = {}) {
  const rows = await db.select().from(schema.experiments).orderBy(desc(schema.experiments.createdAt));
  return rows.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.campaignId && r.campaignId !== filters.campaignId) return false;
    return true;
  });
}

export async function planExperiment(id: string) {
  const experiment = await getExperiment(id);
  if (!experiment) throw new Error("Experiment not found");
  if (experiment.status !== "DRAFT") throw new Error(`Experiment is ${experiment.status}; only DRAFT experiments can be planned.`);

  const variants = await listVariants(id);
  if (variants.length < 2) throw new Error("An experiment needs at least 2 variants before it can be planned.");
  if (!variants.some((v) => v.isControl)) throw new Error("Exactly one variant must be marked isControl before planning.");

  const [row] = await db
    .update(schema.experiments)
    .set({ status: "PLANNED", updatedAt: new Date() })
    .where(eq(schema.experiments.id, id))
    .returning();
  return row ?? null;
}

export async function startExperiment(id: string, actorUserId: string) {
  const experiment = await getExperiment(id);
  if (!experiment) throw new Error("Experiment not found");
  if (experiment.status !== "DRAFT" && experiment.status !== "PLANNED") {
    throw new Error(`Experiment is ${experiment.status}; only DRAFT/PLANNED experiments can be started.`);
  }

  const variants = await listVariants(id);
  if (variants.length < 2) throw new Error("An experiment needs at least 2 variants before it can start.");

  const [row] = await db
    .update(schema.experiments)
    .set({ status: "RUNNING", startDate: new Date(), updatedAt: new Date() })
    .where(eq(schema.experiments.id, id))
    .returning();

  await recordAuditEvent({
    eventType: "EXPERIMENT_STARTED",
    actorUserId,
    targetType: "experiment",
    targetId: id,
    metadata: {},
  });

  return row ?? null;
}

export async function cancelExperiment(id: string, actorUserId: string, reason?: string) {
  const [row] = await db
    .update(schema.experiments)
    .set({ status: "CANCELLED", endDate: new Date(), interpretation: reason ?? null, updatedAt: new Date() })
    .where(eq(schema.experiments.id, id))
    .returning();
  return row ?? null;
}
