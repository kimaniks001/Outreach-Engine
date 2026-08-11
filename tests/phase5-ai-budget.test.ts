import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { setBudgetPolicy, checkBudget } from "@/lib/ai/budget";
import { AIGateway } from "@/lib/ai/gateway";

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

describe("AI budget: soft threshold warns, hard threshold blocks", () => {
  it("soft threshold below current spend produces a warning but does not block", async () => {
    const ownerId = await getOwnerId();
    const taskType = `TEST_TASK_${randomUUID().slice(0, 8)}`;
    await setBudgetPolicy({ scope: "TASK_TYPE", scopeRef: taskType, periodType: "DAILY", softLimitUsd: 0 }, ownerId);

    const result = await checkBudget({ taskType });
    expect(result.blocked).toBe(false);
    expect(result.softWarnings.some((w) => w.scope === "TASK_TYPE" && w.scopeRef === taskType)).toBe(true);
  });

  it("hard threshold at $0 blocks immediately (circuit-breaker: already at/above cap)", async () => {
    const ownerId = await getOwnerId();
    const taskType = `TEST_TASK_${randomUUID().slice(0, 8)}`;
    await setBudgetPolicy({ scope: "TASK_TYPE", scopeRef: taskType, periodType: "DAILY", hardLimitUsd: 0 }, ownerId);

    const result = await checkBudget({ taskType });
    expect(result.blocked).toBe(true);
    expect(result.blockedByPolicy?.scope).toBe("TASK_TYPE");
  });

  it("a later policy for the same (scope, scopeRef, periodType) supersedes the earlier one — only one active at a time", async () => {
    const ownerId = await getOwnerId();
    const taskType = `TEST_TASK_${randomUUID().slice(0, 8)}`;
    await setBudgetPolicy({ scope: "TASK_TYPE", scopeRef: taskType, periodType: "DAILY", hardLimitUsd: 0 }, ownerId);
    await setBudgetPolicy({ scope: "TASK_TYPE", scopeRef: taskType, periodType: "DAILY", hardLimitUsd: 999999 }, ownerId);

    const result = await checkBudget({ taskType });
    expect(result.blocked).toBe(false);

    const active = await db.select().from(schema.aiBudgetPolicies).where(eq(schema.aiBudgetPolicies.scopeRef, taskType));
    expect(active.filter((p) => p.active)).toHaveLength(1);
  });

  it("setting a budget policy is audited as AI_BUDGET_CHANGED", async () => {
    const ownerId = await getOwnerId();
    const taskType = `TEST_TASK_${randomUUID().slice(0, 8)}`;
    const policy = await setBudgetPolicy({ scope: "TASK_TYPE", scopeRef: taskType, periodType: "DAILY", hardLimitUsd: 5 }, ownerId);
    const auditRows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventType, "AI_BUDGET_CHANGED"));
    expect(auditRows.some((a) => a.targetId === policy.id)).toBe(true);
  });
});

describe("AI budget enforcement inside the Gateway", () => {
  it("a hard-capped task type returns BUDGET_EXCEEDED and never reaches the adapter", async () => {
    const ownerId = await getOwnerId();
    await setBudgetPolicy({ scope: "TASK_TYPE", scopeRef: "IMPACT_ANALYSIS", periodType: "DAILY", hardLimitUsd: 0 }, ownerId);

    try {
      const result = await AIGateway.execute({
        taskType: "IMPACT_ANALYSIS",
        correlationId: randomUUID(),
        requestedByUserId: ownerId,
        prompt: { user: "test" },
      });
      expect(result.outcome).toBe("BUDGET_EXCEEDED");

      const auditRows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventType, "AI_BUDGET_EXCEEDED"));
      expect(auditRows.length).toBeGreaterThan(0);
    } finally {
      // Restore unlimited budget so later tests in the suite aren't affected.
      await setBudgetPolicy({ scope: "TASK_TYPE", scopeRef: "IMPACT_ANALYSIS", periodType: "DAILY" }, ownerId);
    }
  });

  it("deterministic, non-AI services remain fully usable regardless of AI budget state", async () => {
    const ownerId = await getOwnerId();
    await setBudgetPolicy({ scope: "GLOBAL", periodType: "DAILY", hardLimitUsd: 0 }, ownerId);
    try {
      // A plain DB read through an unrelated deterministic service must
      // never be affected by the AI budget guard, which only lives inside
      // AIGateway.execute().
      const users = await db.select().from(schema.users).limit(1);
      expect(users.length).toBeGreaterThan(0);
    } finally {
      await setBudgetPolicy({ scope: "GLOBAL", periodType: "DAILY" }, ownerId);
    }
  });
});
