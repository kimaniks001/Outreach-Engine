import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

// AI cost governance — Phase 5 brief Section 28. Enforced inside
// src/lib/ai/gateway.ts::execute(), the single AI Gateway choke point —
// never in individual task callers. A hard-cap block never touches any
// deterministic code path; only AI Gateway calls are affected.

export type BudgetScope = (typeof schema.budgetPolicyScopeEnum.enumValues)[number];
export type BudgetPeriod = (typeof schema.budgetPeriodEnum.enumValues)[number];

export interface SetBudgetPolicyInput {
  scope: BudgetScope;
  scopeRef?: string | null; // providerId/modelId/taskType/userId as text; null only for GLOBAL
  periodType: BudgetPeriod;
  softLimitUsd?: number | null;
  hardLimitUsd?: number | null;
  notes?: string | null;
}

// Supersedes any existing active policy for the same (scope, scopeRef,
// periodType) — same append-with-supersede discipline as budget_approvals
// (Phase 3). Never deletes history.
export async function setBudgetPolicy(input: SetBudgetPolicyInput, actorUserId: string) {
  const existing = await db
    .select({ id: schema.aiBudgetPolicies.id })
    .from(schema.aiBudgetPolicies)
    .where(
      and(
        eq(schema.aiBudgetPolicies.scope, input.scope),
        eq(schema.aiBudgetPolicies.periodType, input.periodType),
        input.scopeRef ? eq(schema.aiBudgetPolicies.scopeRef, input.scopeRef) : sql`${schema.aiBudgetPolicies.scopeRef} is null`,
        eq(schema.aiBudgetPolicies.active, true)
      )
    );
  if (existing.length > 0) {
    await db
      .update(schema.aiBudgetPolicies)
      .set({ active: false, updatedAt: new Date() })
      .where(sql`${schema.aiBudgetPolicies.id} in (${sql.join(existing.map((e) => sql`${e.id}`), sql`, `)})`);
  }

  const [row] = await db
    .insert(schema.aiBudgetPolicies)
    .values({
      scope: input.scope,
      scopeRef: input.scopeRef ?? null,
      periodType: input.periodType,
      softLimitUsd: input.softLimitUsd !== undefined && input.softLimitUsd !== null ? String(input.softLimitUsd) : null,
      hardLimitUsd: input.hardLimitUsd !== undefined && input.hardLimitUsd !== null ? String(input.hardLimitUsd) : null,
      notes: input.notes ?? null,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "AI_BUDGET_CHANGED",
    actorUserId,
    targetType: "ai_budget_policy",
    targetId: row!.id,
    metadata: { scope: input.scope, scopeRef: input.scopeRef ?? null, periodType: input.periodType, softLimitUsd: input.softLimitUsd ?? null, hardLimitUsd: input.hardLimitUsd ?? null },
  });

  return row!;
}

export async function listActiveBudgetPolicies() {
  return db.select().from(schema.aiBudgetPolicies).where(eq(schema.aiBudgetPolicies.active, true));
}

function periodStart(periodType: BudgetPeriod, now: Date): Date {
  if (periodType === "DAILY") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function spendSince(conditions: Parameters<typeof and>[0][]): Promise<number> {
  const rows = await db
    .select({ total: sql<string | null>`sum(${schema.aiUsageRecords.estimatedCostUsd})` })
    .from(schema.aiUsageRecords)
    .where(and(...conditions));
  return rows[0]?.total != null ? Number(rows[0].total) : 0;
}

export interface BudgetCheckContext {
  taskType: string;
  providerId?: string | null;
  modelId?: string | null;
  requestedByUserId?: string | null;
}

export interface BudgetCheckResult {
  blocked: boolean;
  blockedByPolicy: { scope: BudgetScope; scopeRef: string | null; periodType: BudgetPeriod; spend: number; hardLimitUsd: number } | null;
  softWarnings: Array<{ scope: BudgetScope; scopeRef: string | null; periodType: BudgetPeriod; spend: number; softLimitUsd: number }>;
}

// Circuit-breaker semantics: blocks a new call once CUMULATIVE spend so
// far in the period already meets/exceeds the hard cap — it does not try
// to predict the new call's own cost (which is unknown until after
// execution). See docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md.
export async function checkBudget(context: BudgetCheckContext, now: Date = new Date()): Promise<BudgetCheckResult> {
  const policies = await listActiveBudgetPolicies();
  const softWarnings: BudgetCheckResult["softWarnings"] = [];

  const applicable = policies.filter((p) => {
    if (p.scope === "GLOBAL") return true;
    if (p.scope === "PROVIDER") return p.scopeRef === context.providerId;
    if (p.scope === "MODEL") return p.scopeRef === context.modelId;
    if (p.scope === "TASK_TYPE") return p.scopeRef === context.taskType;
    if (p.scope === "USER") return p.scopeRef === context.requestedByUserId;
    return false;
  });

  for (const policy of applicable) {
    const start = periodStart(policy.periodType, now);
    const conditions = [gte(schema.aiUsageRecords.createdAt, start)];
    if (policy.scope === "PROVIDER") conditions.push(eq(schema.aiUsageRecords.providerId, policy.scopeRef!));
    if (policy.scope === "MODEL") conditions.push(eq(schema.aiUsageRecords.modelId, policy.scopeRef!));
    if (policy.scope === "TASK_TYPE") conditions.push(eq(schema.aiUsageRecords.taskType, policy.scopeRef!));
    if (policy.scope === "USER") conditions.push(eq(schema.aiUsageRecords.requestedByUserId, policy.scopeRef!));

    const spend = await spendSince(conditions);

    if (policy.hardLimitUsd !== null && spend >= Number(policy.hardLimitUsd)) {
      return {
        blocked: true,
        blockedByPolicy: { scope: policy.scope, scopeRef: policy.scopeRef, periodType: policy.periodType, spend, hardLimitUsd: Number(policy.hardLimitUsd) },
        softWarnings,
      };
    }
    if (policy.softLimitUsd !== null && spend >= Number(policy.softLimitUsd)) {
      softWarnings.push({ scope: policy.scope, scopeRef: policy.scopeRef, periodType: policy.periodType, spend, softLimitUsd: Number(policy.softLimitUsd) });
    }
  }

  return { blocked: false, blockedByPolicy: null, softWarnings };
}
