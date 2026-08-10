import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

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
