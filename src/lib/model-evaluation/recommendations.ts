import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { listCurrentModelPerformance } from "./performance";
import { routeTask } from "@/lib/ai/router";
import type { AITaskType } from "@/lib/ai/task-types";

// Explainable model-swap recommendations — Phase 5 brief Section 24.
// Comparison is a simple, documented weighted formula over real
// model_performance data — not opaque ML, and never automatically applied
// (Section 25: "Do NOT automatically switch critical task routing").

const MIN_SAMPLE_FOR_COMPARISON = 10;
const MIN_SCORE_IMPROVEMENT = 0.05; // 5% combined-score improvement floor before proposing a swap

type PerformanceRow = Awaited<ReturnType<typeof listCurrentModelPerformance>>[number];

function combinedScore(row: PerformanceRow, maxCost: number, maxLatency: number): number {
  const success = Number(row.successRate);
  const schemaValid = row.schemaValidRate !== null ? Number(row.schemaValidRate) : success; // fall back to success rate if no schema-checked calls
  const normalizedCost = maxCost > 0 && row.avgCostUsd !== null ? Number(row.avgCostUsd) / maxCost : 0;
  const normalizedLatency = maxLatency > 0 && row.avgLatencyMs !== null ? Number(row.avgLatencyMs) / maxLatency : 0;
  return success * 0.4 + schemaValid * 0.2 - normalizedCost * 0.2 - normalizedLatency * 0.2;
}

export async function generateModelRecommendations(actorUserId: string | null) {
  const performance = await listCurrentModelPerformance();
  const byTaskType = new Map<string, PerformanceRow[]>();
  for (const row of performance) {
    if (row.sampleCount < MIN_SAMPLE_FOR_COMPARISON) continue;
    const list = byTaskType.get(row.taskType) ?? [];
    list.push(row);
    byTaskType.set(row.taskType, list);
  }

  const created: (typeof schema.modelRecommendations.$inferSelect)[] = [];

  for (const [taskType, rows] of byTaskType) {
    if (rows.length < 2) continue;

    const maxCost = Math.max(...rows.map((r) => (r.avgCostUsd !== null ? Number(r.avgCostUsd) : 0)));
    const maxLatency = Math.max(...rows.map((r) => (r.avgLatencyMs !== null ? Number(r.avgLatencyMs) : 0)));

    const decision = await routeTask(taskType as AITaskType);
    const fromRow = decision.outcome === "SELECTED" ? rows.find((r) => r.modelId === decision.model.id) : undefined;
    if (!fromRow) continue;

    const fromScore = combinedScore(fromRow, maxCost, maxLatency);
    let best: { row: PerformanceRow; score: number } | null = null;
    for (const row of rows) {
      if (row.modelId === fromRow.modelId) continue;
      const score = combinedScore(row, maxCost, maxLatency);
      if (!best || score > best.score) best = { row, score };
    }
    if (!best) continue;
    if (best.score - fromScore < MIN_SCORE_IMPROVEMENT) continue;

    // Don't propose a duplicate of an already-open recommendation for the
    // same taskType/from/to combination.
    const existing = await db
      .select({ id: schema.modelRecommendations.id })
      .from(schema.modelRecommendations)
      .where(and(eq(schema.modelRecommendations.taskType, taskType), eq(schema.modelRecommendations.toModelId, best.row.modelId), eq(schema.modelRecommendations.status, "PROPOSED")))
      .limit(1);
    if (existing.length > 0) continue;

    const successDelta = round1((Number(best.row.successRate) - Number(fromRow.successRate)) * 100);
    const costDelta =
      fromRow.avgCostUsd !== null && best.row.avgCostUsd !== null && Number(fromRow.avgCostUsd) > 0
        ? round1(((Number(fromRow.avgCostUsd) - Number(best.row.avgCostUsd)) / Number(fromRow.avgCostUsd)) * 100)
        : null;
    const latencyDelta =
      fromRow.avgLatencyMs !== null && best.row.avgLatencyMs !== null && Number(fromRow.avgLatencyMs) > 0
        ? round1(((Number(fromRow.avgLatencyMs) - Number(best.row.avgLatencyMs)) / Number(fromRow.avgLatencyMs)) * 100)
        : null;

    const reasonParts = [`${successDelta >= 0 ? "+" : ""}${successDelta}% success rate`];
    if (costDelta !== null) reasonParts.push(`${costDelta >= 0 ? costDelta + "% lower cost" : Math.abs(costDelta) + "% higher cost"}`);
    if (latencyDelta !== null) reasonParts.push(`${latencyDelta >= 0 ? latencyDelta + "% faster" : Math.abs(latencyDelta) + "% slower"}`);
    reasonParts.push(`sample sizes: ${fromRow.sampleCount} vs ${best.row.sampleCount}`);

    const [row] = await db
      .insert(schema.modelRecommendations)
      .values({
        taskType,
        fromProviderId: fromRow.providerId,
        fromModelId: fromRow.modelId,
        toProviderId: best.row.providerId,
        toModelId: best.row.modelId,
        reason: reasonParts.join(", "),
        supportingMetrics: { from: summarize(fromRow), to: summarize(best.row) },
        status: "PROPOSED",
      })
      .returning();
    created.push(row!);

    await recordAuditEvent({
      eventType: "MODEL_RECOMMENDATION_CREATED",
      actorUserId: actorUserId ?? undefined,
      targetType: "model_recommendation",
      targetId: row!.id,
      metadata: { taskType, fromModelId: fromRow.modelId, toModelId: best.row.modelId },
    });
  }

  return created;
}

function summarize(row: PerformanceRow) {
  return {
    modelId: row.modelId,
    sampleCount: row.sampleCount,
    successRate: Number(row.successRate),
    schemaValidRate: row.schemaValidRate !== null ? Number(row.schemaValidRate) : null,
    avgCostUsd: row.avgCostUsd !== null ? Number(row.avgCostUsd) : null,
    avgLatencyMs: row.avgLatencyMs !== null ? Number(row.avgLatencyMs) : null,
  };
}

export interface ListModelRecommendationsFilters {
  status?: (typeof schema.modelRecommendationStatusEnum.enumValues)[number];
}

export async function listModelRecommendations(filters: ListModelRecommendationsFilters = {}) {
  const rows = await db.select().from(schema.modelRecommendations).orderBy(desc(schema.modelRecommendations.createdAt));
  return rows.filter((r) => !filters.status || r.status === filters.status);
}

export async function getModelRecommendation(id: string) {
  const rows = await db.select().from(schema.modelRecommendations).where(eq(schema.modelRecommendations.id, id)).limit(1);
  return rows[0] ?? null;
}

// OWNER-only (enforced by the caller) — approving a model recommendation
// does NOT change routing by itself. See applyModelRecommendation.
export async function reviewModelRecommendation(id: string, action: "APPROVE" | "REJECT", actorUserId: string) {
  const [row] = await db
    .update(schema.modelRecommendations)
    .set({ status: action === "APPROVE" ? "APPROVED" : "REJECTED", reviewedByUserId: actorUserId, reviewedAt: new Date() })
    .where(eq(schema.modelRecommendations.id, id))
    .returning();

  if (row) {
    await recordAuditEvent({
      eventType: action === "APPROVE" ? "MODEL_RECOMMENDATION_APPROVED" : "MODEL_RECOMMENDATION_REJECTED",
      actorUserId,
      targetType: "model_recommendation",
      targetId: id,
      metadata: { taskType: row.taskType },
    });
  }

  return row ?? null;
}

// The ONLY code path that actually changes routing policy — OWNER-only,
// requires the recommendation to already be APPROVED. Adds the taskType to
// the "to" model's approvedTaskTypes (does not remove it from the "from"
// model — the deterministic router already prefers the higher-quality
// candidate; removing the old one is a separate, more consequential
// decision left to Admin → Models).
export async function applyModelRecommendation(id: string, actorUserId: string) {
  const recommendation = await getModelRecommendation(id);
  if (!recommendation) throw new Error("Model recommendation not found");
  if (recommendation.status !== "APPROVED") {
    throw new Error(`Recommendation is ${recommendation.status}; only APPROVED recommendations can be applied.`);
  }

  const [toModel] = await db.select().from(schema.aiModels).where(eq(schema.aiModels.id, recommendation.toModelId)).limit(1);
  if (!toModel) throw new Error("Target model not found");

  const nextApprovedTaskTypes = toModel.approvedTaskTypes.includes(recommendation.taskType)
    ? toModel.approvedTaskTypes
    : [...toModel.approvedTaskTypes, recommendation.taskType];

  await db.update(schema.aiModels).set({ approvedTaskTypes: nextApprovedTaskTypes, updatedAt: new Date() }).where(eq(schema.aiModels.id, toModel.id));

  await db.update(schema.modelRecommendations).set({ status: "APPLIED" }).where(eq(schema.modelRecommendations.id, id));

  await recordAuditEvent({
    eventType: "ROUTING_POLICY_CHANGED",
    actorUserId,
    targetType: "ai_model",
    targetId: toModel.id,
    metadata: { taskType: recommendation.taskType, modelRecommendationId: id, approvedTaskTypes: nextApprovedTaskTypes },
  });

  return { toModel, recommendation };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
