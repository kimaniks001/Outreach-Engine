import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAdapter } from "./adapters";
import { deriveProviderStatus } from "./status";
import type { AIModel, AIProvider } from "./types";
import type { AITaskType } from "./task-types";

function toAIProvider(row: typeof schema.aiProviders.$inferSelect): AIProvider {
  const adapter = getAdapter(row.key);
  const credentialsConfigured = adapter ? adapter.hasCredentials() : false;
  const status = deriveProviderStatus({
    enabled: row.enabled,
    adapterImplemented: row.adapterImplemented,
    credentialsConfigured,
    manuallyDegraded: row.status === "DEGRADED",
  });

  return {
    id: row.id,
    key: row.key,
    displayName: row.displayName,
    status,
    adapterImplemented: row.adapterImplemented,
    credentialsConfigured,
    enabled: row.enabled,
  };
}

function toAIModel(row: typeof schema.aiModels.$inferSelect): AIModel {
  return {
    id: row.id,
    providerId: row.providerId,
    modelKey: row.modelKey,
    displayName: row.displayName,
    enabled: row.enabled,
    approved: row.approved,
    status: row.status,
    capabilities: row.capabilities,
    approvedTaskTypes: row.approvedTaskTypes as AITaskType[],
    structuredOutputSupport: row.structuredOutputSupport,
    contextWindowTokens: row.contextWindowTokens,
    costInputPer1kUsd: row.costInputPer1kUsd ? Number(row.costInputPer1kUsd) : null,
    costOutputPer1kUsd: row.costOutputPer1kUsd ? Number(row.costOutputPer1kUsd) : null,
    qualityScore: row.qualityScore ? Number(row.qualityScore) : null,
  };
}

export async function listProviders(): Promise<AIProvider[]> {
  const rows = await db.select().from(schema.aiProviders).orderBy(schema.aiProviders.displayName);
  return rows.map(toAIProvider);
}

export async function getProvider(id: string): Promise<AIProvider | null> {
  const rows = await db
    .select()
    .from(schema.aiProviders)
    .where(eq(schema.aiProviders.id, id))
    .limit(1);
  return rows[0] ? toAIProvider(rows[0]) : null;
}

export async function listModels(): Promise<AIModel[]> {
  const rows = await db.select().from(schema.aiModels).orderBy(schema.aiModels.displayName);
  return rows.map(toAIModel);
}

export async function listModelsWithProviders(): Promise<
  Array<{ model: AIModel; provider: AIProvider }>
> {
  const rows = await db
    .select()
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id));

  return rows.map((row) => ({
    model: toAIModel(row.ai_models),
    provider: toAIProvider(row.ai_providers),
  }));
}

// Models that are, right now, legitimately routable for a task type: their
// provider must be AVAILABLE (not just "configured"), the model itself must
// be enabled + approved, and the task type must be in its approved list.
// This is the candidate set src/lib/ai/router.ts chooses from.
export async function listRoutableModelsForTask(
  taskType: AITaskType
): Promise<Array<{ model: AIModel; provider: AIProvider }>> {
  const all = await listModelsWithProviders();
  return all.filter(
    ({ model, provider }) =>
      provider.status === "AVAILABLE" &&
      model.enabled &&
      model.approved &&
      model.status === "APPROVED" &&
      model.approvedTaskTypes.includes(taskType)
  );
}
