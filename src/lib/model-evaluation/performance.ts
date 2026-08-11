import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { routeTask } from "@/lib/ai/router";
import type { AITaskType } from "@/lib/ai/task-types";

// Model/provider evaluation — Phase 5 brief Sections 22-23. Computed
// entirely from real `ai_usage_records` history; nothing here is invented.
// humanAcceptanceRate/revisionRate are honestly left null
// (INSUFFICIENT_DATA) — no human accept/reject/revise signal is captured
// anywhere in this codebase for AI-drafted output, and fabricating a proxy
// would violate the "never fabricate" principle applied everywhere else in
// this system. See docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md.

export const DEFAULT_EVALUATION_WINDOW_DAYS = 30;
const MIN_SAMPLE_FOR_CONFIDENCE = 10;

export interface ModelTaskKey {
  providerId: string;
  modelId: string;
  taskType: string;
}

async function listDistinctProviderModelTaskCombos(windowStart: Date): Promise<ModelTaskKey[]> {
  const rows = await db
    .selectDistinct({
      providerId: schema.aiUsageRecords.providerId,
      modelId: schema.aiUsageRecords.modelId,
      taskType: schema.aiUsageRecords.taskType,
    })
    .from(schema.aiUsageRecords)
    .where(and(gte(schema.aiUsageRecords.createdAt, windowStart), isNotNull(schema.aiUsageRecords.providerId), isNotNull(schema.aiUsageRecords.modelId)));

  return rows
    .filter((r): r is { providerId: string; modelId: string; taskType: string } => !!r.providerId && !!r.modelId)
    .map((r) => ({ providerId: r.providerId, modelId: r.modelId, taskType: r.taskType }));
}

// Reuses the live deterministic router (src/lib/ai/router.ts) as the
// "currently preferred model" reference point — fallbackRate for a
// non-preferred model's row is trivially 1 (all of its use was, by
// definition, not the current top choice); for the currently-preferred
// model, it's the share of that task type's total volume that went
// elsewhere during the window. A documented simplification, not a
// point-in-time-accurate replay of historical routing decisions.
async function computeFallbackRate(taskType: string, modelId: string, windowStart: Date): Promise<number> {
  const decision = await routeTask(taskType as AITaskType);
  const isCurrentPreferred = decision.outcome === "SELECTED" && decision.model.id === modelId;

  if (!isCurrentPreferred) return 1;

  const [totalRow, thisModelRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.aiUsageRecords)
      .where(and(eq(schema.aiUsageRecords.taskType, taskType), gte(schema.aiUsageRecords.createdAt, windowStart))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.aiUsageRecords)
      .where(and(eq(schema.aiUsageRecords.taskType, taskType), eq(schema.aiUsageRecords.modelId, modelId), gte(schema.aiUsageRecords.createdAt, windowStart))),
  ]);

  const total = totalRow[0]?.count ?? 0;
  const thisModel = thisModelRow[0]?.count ?? 0;
  if (total === 0) return 0;
  return round4((total - thisModel) / total);
}

export async function computeModelPerformanceFor(
  key: ModelTaskKey,
  windowDays: number = DEFAULT_EVALUATION_WINDOW_DAYS
): Promise<typeof schema.modelPerformance.$inferInsert> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const windowEnd = new Date();

  const rows = await db
    .select()
    .from(schema.aiUsageRecords)
    .where(
      and(
        eq(schema.aiUsageRecords.providerId, key.providerId),
        eq(schema.aiUsageRecords.modelId, key.modelId),
        eq(schema.aiUsageRecords.taskType, key.taskType),
        gte(schema.aiUsageRecords.createdAt, windowStart)
      )
    );

  const sampleCount = rows.length;
  const successCount = rows.filter((r) => r.success).length;
  const schemaCheckedRows = rows.filter((r) => r.schemaValid !== null);
  const schemaValidCount = schemaCheckedRows.filter((r) => r.schemaValid === true).length;
  const latencies = rows.map((r) => r.latencyMs).filter((v): v is number => v !== null);
  const costs = rows.map((r) => (r.estimatedCostUsd !== null ? Number(r.estimatedCostUsd) : null)).filter((v): v is number => v !== null);

  const fallbackRate = await computeFallbackRate(key.taskType, key.modelId, windowStart);

  return {
    providerId: key.providerId,
    modelId: key.modelId,
    taskType: key.taskType,
    sampleCount,
    successRate: String(sampleCount > 0 ? round4(successCount / sampleCount) : 0),
    schemaValidRate: schemaCheckedRows.length > 0 ? String(round4(schemaValidCount / schemaCheckedRows.length)) : null,
    humanAcceptanceRate: null, // no signal captured anywhere in this codebase — see module comment
    revisionRate: null,
    avgLatencyMs: latencies.length > 0 ? String(round2(latencies.reduce((a, b) => a + b, 0) / latencies.length)) : null,
    avgCostUsd: costs.length > 0 ? String(round2(costs.reduce((a, b) => a + b, 0) / costs.length)) : null,
    fallbackRate: String(fallbackRate),
    evaluationWindowStart: windowStart,
    evaluationWindowEnd: windowEnd,
    confidence: sampleCount >= MIN_SAMPLE_FOR_CONFIDENCE * 3 ? "HIGH" : sampleCount >= MIN_SAMPLE_FOR_CONFIDENCE ? "MEDIUM" : sampleCount > 0 ? "LOW" : "INSUFFICIENT_DATA",
    isBenchmark: false,
  };
}

// Refreshes model_performance for every (provider, model, taskType)
// combination with usage in the window — on demand, no scheduler (Section
// 31/44). Append-only snapshot pattern.
export async function refreshModelPerformance(actorUserId: string | null, windowDays: number = DEFAULT_EVALUATION_WINDOW_DAYS) {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const combos = await listDistinctProviderModelTaskCombos(windowStart);

  const inserted: (typeof schema.modelPerformance.$inferSelect)[] = [];
  for (const combo of combos) {
    const snapshot = await computeModelPerformanceFor(combo, windowDays);
    const [row] = await db.insert(schema.modelPerformance).values(snapshot).returning();
    inserted.push(row!);
  }

  await recordAuditEvent({
    eventType: "MODEL_PERFORMANCE_REFRESHED",
    actorUserId: actorUserId ?? undefined,
    targetType: "model_performance_batch",
    metadata: { comboCount: combos.length, windowDays },
  });

  return inserted;
}

export async function listCurrentModelPerformance(): Promise<(typeof schema.modelPerformance.$inferSelect)[]> {
  const rows = await db.select().from(schema.modelPerformance).where(eq(schema.modelPerformance.isBenchmark, false));
  // "Current" = latest computedAt per (providerId, modelId, taskType).
  const latest = new Map<string, typeof schema.modelPerformance.$inferSelect>();
  for (const row of rows) {
    const key = `${row.providerId}:${row.modelId}:${row.taskType}`;
    const existing = latest.get(key);
    if (!existing || row.computedAt > existing.computedAt) latest.set(key, row);
  }
  return [...latest.values()];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
