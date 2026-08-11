import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Set by src/lib/ai/tasks/run-structured-task.ts immediately after it knows
// whether the raw output actually parsed/validated — see
// docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md. Null (never called) means
// "not a structured-output call" or "call did not reach EXECUTED", which
// is distinct from false ("executed but failed schema validation").
export async function markSchemaValid(usageRecordId: string, valid: boolean): Promise<void> {
  await db.update(schema.aiUsageRecords).set({ schemaValid: valid }).where(eq(schema.aiUsageRecords.id, usageRecordId));
}

export interface UsageRow {
  id: string;
  taskType: string;
  providerName: string | null;
  modelName: string | null;
  success: boolean;
  routingReason: string;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  correlationId: string;
  createdAt: Date;
}

export async function listRecentUsage(limit = 50): Promise<UsageRow[]> {
  const rows = await db
    .select({
      id: schema.aiUsageRecords.id,
      taskType: schema.aiUsageRecords.taskType,
      providerName: schema.aiProviders.displayName,
      modelName: schema.aiModels.displayName,
      success: schema.aiUsageRecords.success,
      routingReason: schema.aiUsageRecords.routingReason,
      latencyMs: schema.aiUsageRecords.latencyMs,
      estimatedCostUsd: schema.aiUsageRecords.estimatedCostUsd,
      correlationId: schema.aiUsageRecords.correlationId,
      createdAt: schema.aiUsageRecords.createdAt,
    })
    .from(schema.aiUsageRecords)
    .leftJoin(schema.aiProviders, eq(schema.aiUsageRecords.providerId, schema.aiProviders.id))
    .leftJoin(schema.aiModels, eq(schema.aiUsageRecords.modelId, schema.aiModels.id))
    .orderBy(desc(schema.aiUsageRecords.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    estimatedCostUsd: row.estimatedCostUsd ? Number(row.estimatedCostUsd) : null,
  }));
}

export async function getUsageRecord(id: string): Promise<UsageRow | null> {
  const rows = await db
    .select({
      id: schema.aiUsageRecords.id,
      taskType: schema.aiUsageRecords.taskType,
      providerName: schema.aiProviders.displayName,
      modelName: schema.aiModels.displayName,
      success: schema.aiUsageRecords.success,
      routingReason: schema.aiUsageRecords.routingReason,
      latencyMs: schema.aiUsageRecords.latencyMs,
      estimatedCostUsd: schema.aiUsageRecords.estimatedCostUsd,
      correlationId: schema.aiUsageRecords.correlationId,
      createdAt: schema.aiUsageRecords.createdAt,
    })
    .from(schema.aiUsageRecords)
    .leftJoin(schema.aiProviders, eq(schema.aiUsageRecords.providerId, schema.aiProviders.id))
    .leftJoin(schema.aiModels, eq(schema.aiUsageRecords.modelId, schema.aiModels.id))
    .where(eq(schema.aiUsageRecords.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { ...row, estimatedCostUsd: row.estimatedCostUsd ? Number(row.estimatedCostUsd) : null };
}
