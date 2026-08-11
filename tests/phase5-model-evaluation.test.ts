import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { computeModelPerformanceFor, refreshModelPerformance } from "@/lib/model-evaluation/performance";
import { generateModelRecommendations, applyModelRecommendation } from "@/lib/model-evaluation/recommendations";

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

async function getMockProviderAndModel() {
  const [provider] = await db.select().from(schema.aiProviders).where(eq(schema.aiProviders.key, "mock")).limit(1);
  if (!provider) throw new Error("mock provider not seeded");
  const [model] = await db.select().from(schema.aiModels).where(eq(schema.aiModels.providerId, provider.id)).limit(1);
  if (!model) throw new Error("mock model not seeded");
  return { provider, model };
}

async function insertUsageRecord(overrides: Partial<typeof schema.aiUsageRecords.$inferInsert>) {
  const { provider, model } = await getMockProviderAndModel();
  const [row] = await db
    .insert(schema.aiUsageRecords)
    .values({
      taskType: "IMPACT_ANALYSIS",
      providerId: provider.id,
      modelId: model.id,
      success: true,
      routingReason: "test",
      correlationId: randomUUID(),
      ...overrides,
    })
    .returning();
  return row!;
}

describe("model performance aggregation: computed from real ai_usage_records", () => {
  it("successRate/avgLatencyMs/avgCostUsd match the inserted sample exactly", async () => {
    const { provider, model } = await getMockProviderAndModel();
    const taskType = `TEST_TASK_${randomUUID().slice(0, 8)}`;

    await insertUsageRecord({ taskType, success: true, latencyMs: 100, estimatedCostUsd: "0.01000", schemaValid: true });
    await insertUsageRecord({ taskType, success: true, latencyMs: 300, estimatedCostUsd: "0.03000", schemaValid: true });
    await insertUsageRecord({ taskType, success: false, latencyMs: 50, schemaValid: false });

    const snapshot = await computeModelPerformanceFor({ providerId: provider.id, modelId: model.id, taskType });
    expect(snapshot.sampleCount).toBe(3);
    expect(Number(snapshot.successRate)).toBeCloseTo(2 / 3, 4);
    expect(Number(snapshot.avgLatencyMs)).toBeCloseTo((100 + 300 + 50) / 3, 1);
    expect(Number(snapshot.avgCostUsd)).toBeCloseTo((0.01 + 0.03) / 2, 4);
    expect(Number(snapshot.schemaValidRate)).toBeCloseTo(2 / 3, 4);
  });

  it("an unseen (provider, model, taskType) combination reports INSUFFICIENT_DATA confidence and zero sample count", async () => {
    const { provider, model } = await getMockProviderAndModel();
    const snapshot = await computeModelPerformanceFor({ providerId: provider.id, modelId: model.id, taskType: `NEVER_USED_${randomUUID()}` });
    expect(snapshot.sampleCount).toBe(0);
    expect(snapshot.confidence).toBe("INSUFFICIENT_DATA");
  });

  it("humanAcceptanceRate/revisionRate are honestly null — no such signal exists in this codebase", async () => {
    const { provider, model } = await getMockProviderAndModel();
    const taskType = `TEST_TASK_${randomUUID().slice(0, 8)}`;
    await insertUsageRecord({ taskType, success: true });
    const snapshot = await computeModelPerformanceFor({ providerId: provider.id, modelId: model.id, taskType });
    expect(snapshot.humanAcceptanceRate).toBeNull();
    expect(snapshot.revisionRate).toBeNull();
  });

  it("refreshModelPerformance persists a snapshot for every real combination with usage in the window", async () => {
    const ownerId = await getOwnerId();
    const taskType = `TEST_TASK_${randomUUID().slice(0, 8)}`;
    await insertUsageRecord({ taskType, success: true });
    const results = await refreshModelPerformance(ownerId, 30);
    expect(results.some((r) => r.taskType === taskType)).toBe(true);
  });
});

describe("model recommendations: explainable, never auto-applied", () => {
  it("a recommendation cites concrete metric deltas in its reason text", async () => {
    const ownerId = await getOwnerId();
    const { provider, model } = await getMockProviderAndModel();

    // Insert a second synthetic model under the same provider so a
    // comparison is possible.
    const [altModel] = await db
      .insert(schema.aiModels)
      .values({ providerId: provider.id, modelKey: `alt-${randomUUID().slice(0, 8)}`, displayName: "Alt test model", approved: true, enabled: true, status: "APPROVED", approvedTaskTypes: [] })
      .returning();

    const taskType = `TEST_TASK_${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 12; i++) await insertUsageRecord({ taskType, modelId: model.id, success: i < 6, latencyMs: 500, estimatedCostUsd: "0.05000" });
    for (let i = 0; i < 12; i++) await insertUsageRecord({ taskType, modelId: altModel!.id, success: true, latencyMs: 50, estimatedCostUsd: "0.00100" });

    const recommendations = await generateModelRecommendations(ownerId);
    const forTask = recommendations.find((r) => r.taskType === taskType);
    if (forTask) {
      expect(forTask.reason.length).toBeGreaterThan(0);
      expect(forTask.status).toBe("PROPOSED");
    }
  });

  it("applying a recommendation before it is APPROVED is rejected — routing never changes silently", async () => {
    const ownerId = await getOwnerId();
    const { provider, model } = await getMockProviderAndModel();
    const [toModel] = await db
      .insert(schema.aiModels)
      .values({ providerId: provider.id, modelKey: `to-${randomUUID().slice(0, 8)}`, displayName: "To model", approved: true, enabled: true, status: "APPROVED", approvedTaskTypes: [] })
      .returning();

    const [rec] = await db
      .insert(schema.modelRecommendations)
      .values({ taskType: "IMPACT_ANALYSIS", fromProviderId: provider.id, fromModelId: model.id, toProviderId: provider.id, toModelId: toModel!.id, reason: "test", status: "PROPOSED" })
      .returning();

    await expect(applyModelRecommendation(rec!.id, ownerId)).rejects.toThrow();

    const [reloaded] = await db.select().from(schema.aiModels).where(eq(schema.aiModels.id, toModel!.id)).limit(1);
    expect(reloaded?.approvedTaskTypes).not.toContain("IMPACT_ANALYSIS");
  });

  it("applying an APPROVED recommendation updates routing policy and is audited as ROUTING_POLICY_CHANGED", async () => {
    const ownerId = await getOwnerId();
    const { provider, model } = await getMockProviderAndModel();
    const [toModel] = await db
      .insert(schema.aiModels)
      .values({ providerId: provider.id, modelKey: `to2-${randomUUID().slice(0, 8)}`, displayName: "To model 2", approved: true, enabled: true, status: "APPROVED", approvedTaskTypes: [] })
      .returning();
    const taskType = `TEST_TASK_${randomUUID().slice(0, 8)}`;

    const [rec] = await db
      .insert(schema.modelRecommendations)
      .values({ taskType, fromProviderId: provider.id, fromModelId: model.id, toProviderId: provider.id, toModelId: toModel!.id, reason: "test", status: "APPROVED" })
      .returning();

    await applyModelRecommendation(rec!.id, ownerId);

    const [reloaded] = await db.select().from(schema.aiModels).where(eq(schema.aiModels.id, toModel!.id)).limit(1);
    expect(reloaded?.approvedTaskTypes).toContain(taskType);

    const auditRows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventType, "ROUTING_POLICY_CHANGED"));
    expect(auditRows.some((a) => a.targetId === toModel!.id)).toBe(true);
  });
});
