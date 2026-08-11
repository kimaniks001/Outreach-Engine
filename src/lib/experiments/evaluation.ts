import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { getExperiment, listVariants } from "./experiments";
import { summarizeExperiment } from "@/lib/ai/tasks/summarize-experiment";

// Deterministic, explainable experiment evaluation — Phase 5 brief Section
// 12. Explicitly NOT an advanced statistical platform: a simple
// sample-size floor plus a fixed relative-lift banding stands in for a
// real significance test, documented as such rather than presented as
// more rigorous than it is.

export const EVALUATION_ENGINE_VERSION = "phase5-experiment-eval-v1";

const MIN_SAMPLE_PER_VARIANT = 20;
const HIGH_CONFIDENCE_MIN_SAMPLE = 50;
const HIGH_LIFT_THRESHOLD = 0.2;
const MEDIUM_LIFT_THRESHOLD = 0.1;

export interface VariantMetric {
  variantId: string;
  label: string;
  isControl: boolean;
  sampleCount: number;
  primaryMetricCount: number;
  conversionRate: number;
  absoluteDifference: number | null;
  relativeDifference: number | null;
}

export interface EvaluationOutcome {
  perVariant: VariantMetric[];
  winnerVariantId: string | null;
  confidence: (typeof schema.evidenceConfidenceEnum.enumValues)[number];
  interpretation: string;
}

async function distinctProfilesForPlan(distributionPlanId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ profileId: schema.touchpoints.profileId })
    .from(schema.touchpoints)
    .where(eq(schema.touchpoints.distributionPlanId, distributionPlanId));
  return rows.map((r) => r.profileId);
}

async function conversionCountForProfiles(
  profileIds: string[],
  conversionType: (typeof schema.conversionTypeEnum.enumValues)[number],
  startDate: Date | null,
  endDate: Date | null
): Promise<number> {
  if (profileIds.length === 0) return 0;
  const conditions = [inArray(schema.conversionEvents.profileId, profileIds), eq(schema.conversionEvents.conversionType, conversionType)];
  if (startDate) conditions.push(gte(schema.conversionEvents.occurredAt, startDate));
  if (endDate) conditions.push(lte(schema.conversionEvents.occurredAt, endDate));
  const rows = await db
    .select({ id: schema.conversionEvents.id })
    .from(schema.conversionEvents)
    .where(and(...conditions));
  return rows.length;
}

export class ExperimentEvaluationError extends Error {}

// Pure computation — no DB writes. See evaluateAndPersist for the
// persisting orchestration.
export async function computeEvaluation(experimentId: string): Promise<EvaluationOutcome> {
  const experiment = await getExperiment(experimentId);
  if (!experiment) throw new ExperimentEvaluationError("Experiment not found");
  if (!experiment.primaryMetricType) {
    throw new ExperimentEvaluationError(
      "Experiment has no primaryMetricType set — experiments must optimize toward actual SecurePay behavior (Section 11), not impressions/clicks alone. Set a real conversion type before evaluating."
    );
  }

  const variants = await listVariants(experimentId);
  if (variants.length < 2) throw new ExperimentEvaluationError("Experiment needs at least 2 variants to evaluate.");

  const control = variants.find((v) => v.isControl) ?? variants[0]!;

  const perVariant: VariantMetric[] = [];
  for (const variant of variants) {
    const profileIds = variant.distributionPlanId ? await distinctProfilesForPlan(variant.distributionPlanId) : [];
    const sampleCount = profileIds.length;
    const primaryMetricCount = await conversionCountForProfiles(
      profileIds,
      experiment.primaryMetricType,
      experiment.startDate,
      experiment.endDate
    );
    const conversionRate = sampleCount > 0 ? primaryMetricCount / sampleCount : 0;
    perVariant.push({
      variantId: variant.id,
      label: variant.variantLabel,
      isControl: variant.id === control.id,
      sampleCount,
      primaryMetricCount,
      conversionRate: round4(conversionRate),
      absoluteDifference: null,
      relativeDifference: null,
    });
  }

  const controlMetric = perVariant.find((v) => v.isControl)!;
  for (const v of perVariant) {
    if (v.isControl) continue;
    v.absoluteDifference = round4(v.conversionRate - controlMetric.conversionRate);
    v.relativeDifference = controlMetric.conversionRate > 0 ? round4(v.absoluteDifference / controlMetric.conversionRate) : null;
  }

  const insufficientSample = perVariant.some((v) => v.sampleCount < MIN_SAMPLE_PER_VARIANT);
  if (insufficientSample) {
    return {
      perVariant,
      winnerVariantId: null,
      confidence: "INSUFFICIENT_DATA",
      interpretation: `Insufficient sample: every variant needs at least ${MIN_SAMPLE_PER_VARIANT} reached profiles before a result can be evaluated (smallest variant: ${Math.min(
        ...perVariant.map((v) => v.sampleCount)
      )}).`,
    };
  }

  const challengers = perVariant.filter((v) => !v.isControl);
  const best = challengers.reduce((top, v) => (v.conversionRate > top.conversionRate ? v : top), challengers[0]!);

  const bestLift = best.relativeDifference ?? 0;
  const allWellSampled = perVariant.every((v) => v.sampleCount >= HIGH_CONFIDENCE_MIN_SAMPLE);

  let confidence: EvaluationOutcome["confidence"];
  let winnerVariantId: string | null;
  let interpretation: string;

  if (bestLift <= 0 || best.conversionRate <= controlMetric.conversionRate) {
    confidence = "LOW";
    winnerVariantId = null;
    interpretation = `No challenger variant outperformed the control (${controlMetric.label}: ${(controlMetric.conversionRate * 100).toFixed(1)}%). No winner.`;
  } else if (Math.abs(bestLift) >= HIGH_LIFT_THRESHOLD && allWellSampled) {
    confidence = "HIGH";
    winnerVariantId = best.variantId;
    interpretation = `${best.label} outperformed control ${controlMetric.label} by ${(bestLift * 100).toFixed(1)}% relative lift (${(best.conversionRate * 100).toFixed(1)}% vs ${(controlMetric.conversionRate * 100).toFixed(1)}%) on "${experiment.primaryMetric}", with all variants at ${HIGH_CONFIDENCE_MIN_SAMPLE}+ reached profiles.`;
  } else if (Math.abs(bestLift) >= MEDIUM_LIFT_THRESHOLD) {
    confidence = "MEDIUM";
    winnerVariantId = best.variantId;
    interpretation = `${best.label} outperformed control ${controlMetric.label} by ${(bestLift * 100).toFixed(1)}% relative lift on "${experiment.primaryMetric}" — meaningful but not at the high-confidence sample threshold (${HIGH_CONFIDENCE_MIN_SAMPLE}+ per variant).`;
  } else {
    confidence = "LOW";
    winnerVariantId = null;
    interpretation = `${best.label} showed a ${(bestLift * 100).toFixed(1)}% relative lift over control ${controlMetric.label} — too small to call a winner (below the ${(MEDIUM_LIFT_THRESHOLD * 100).toFixed(0)}% threshold).`;
  }

  return { perVariant, winnerVariantId, confidence, interpretation };
}

export interface EvaluateAndPersistOptions {
  useAiNarrative?: boolean;
  requestedByUserId?: string;
  generatedByUserId?: string | null;
}

export async function evaluateAndPersist(experimentId: string, options: EvaluateAndPersistOptions = {}) {
  const experiment = await getExperiment(experimentId);
  if (!experiment) throw new ExperimentEvaluationError("Experiment not found");
  if (experiment.status !== "RUNNING") {
    throw new ExperimentEvaluationError(`Experiment is ${experiment.status}; only RUNNING experiments can be evaluated.`);
  }

  const outcome = await computeEvaluation(experimentId);

  let interpretation = outcome.interpretation;
  let aiEnrichmentUsed = false;
  let aiUsageRecordId: string | null = null;

  if (options.useAiNarrative && options.requestedByUserId) {
    const summary = await summarizeExperiment({
      hypothesis: experiment.hypothesis,
      deterministicResult: outcome.interpretation,
      requestedByUserId: options.requestedByUserId,
    });
    if (summary.narrative) {
      interpretation = `${outcome.interpretation} ${summary.narrative}`;
      aiEnrichmentUsed = true;
    }
    aiUsageRecordId = summary.aiUsageRecordId;
  }

  const [resultRow] = await db
    .insert(schema.experimentResults)
    .values({
      experimentId,
      perVariant: outcome.perVariant,
      winnerVariantId: outcome.winnerVariantId,
      confidence: outcome.confidence,
      interpretation,
      evaluationEngineVersion: EVALUATION_ENGINE_VERSION,
      aiEnrichmentUsed,
      aiUsageRecordId,
      generatedByUserId: options.generatedByUserId ?? null,
    })
    .returning();

  const nextStatus = outcome.winnerVariantId ? "COMPLETED" : "INCONCLUSIVE";

  await db
    .update(schema.experiments)
    .set({
      status: nextStatus,
      endDate: experiment.endDate ?? new Date(),
      result: outcome.winnerVariantId
        ? `Winner: ${outcome.perVariant.find((v) => v.variantId === outcome.winnerVariantId)?.label}`
        : "No winner",
      interpretation,
      confidence: outcome.confidence,
      winnerVariantId: outcome.winnerVariantId,
      updatedAt: new Date(),
    })
    .where(eq(schema.experiments.id, experimentId));

  await recordAuditEvent({
    eventType: "EXPERIMENT_COMPLETED",
    actorUserId: options.generatedByUserId ?? undefined,
    targetType: "experiment",
    targetId: experimentId,
    metadata: { status: nextStatus, confidence: outcome.confidence, winnerVariantId: outcome.winnerVariantId },
  });

  return { result: resultRow!, status: nextStatus };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
