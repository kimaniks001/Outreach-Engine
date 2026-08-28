import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { assertNotSafeMode } from "@/lib/safe-mode/state";
import { routeDistribution } from "./router";
import { getDistributionAdapter } from "./adapters";
import { assertBudgetApprovedForLaunch, BudgetNotApprovedError } from "./budget-guard";
import {
  assertCurrentMarketAssetsForVariants,
  MarketAssetNotAuthorisedError,
} from "./market-asset-authority";
import type { ChannelType } from "./channels";

export type LaunchOutcome =
  | { outcome: "LAUNCHED"; executionId: string; externalExecutionId: string }
  | { outcome: "SAFE_MODE_BLOCKED"; reason: string }
  | { outcome: "MARKET_ASSET_NOT_AUTHORISED"; reason: string }
  | { outcome: "BUDGET_NOT_APPROVED"; reason: string }
  | { outcome: "PLAN_NOT_READY"; reason: string }
  | { outcome: "ADAPTER_NOT_AVAILABLE"; executionId: string; reason: string }
  | { outcome: "EXECUTION_ERROR"; executionId: string; reason: string };

export async function launch(distributionPlanId: string, actorUserId: string): Promise<LaunchOutcome> {
  const [plan] = await db
    .select()
    .from(schema.distributionPlans)
    .where(eq(schema.distributionPlans.id, distributionPlanId))
    .limit(1);
  if (!plan) throw new Error("Distribution plan not found");

  if (plan.status !== "READY") {
    return { outcome: "PLAN_NOT_READY", reason: `Plan status is ${plan.status}; it must be READY to launch.` };
  }

  try {
    await assertNotSafeMode("DISTRIBUTION_EXECUTION");
  } catch {
    await recordAuditEvent({
      eventType: "SAFE_MODE_BLOCKED_EXECUTION",
      actorUserId,
      targetType: "distribution_plan",
      targetId: distributionPlanId,
      metadata: { channel: plan.channel },
    });
    return { outcome: "SAFE_MODE_BLOCKED", reason: "System is in SAFE_MODE — execution is blocked." };
  }

  // READY is not a permanent publication entitlement. Re-check the current
  // Asset Library immediately before any spend/provider work so a revoked,
  // superseded or stale Market Release stops execution even if the plan was
  // marked READY earlier.
  let assetAuthority;
  try {
    assetAuthority = await assertCurrentMarketAssetsForVariants(plan.campaignId, plan.creativeVariantIds);
  } catch (err) {
    if (err instanceof MarketAssetNotAuthorisedError) {
      await recordAuditEvent({
        eventType: "DISTRIBUTION_ASSET_AUTHORITY_BLOCKED",
        actorUserId,
        targetType: "distribution_plan",
        targetId: distributionPlanId,
        metadata: { channel: plan.channel, reason: err.message },
      });
      return { outcome: "MARKET_ASSET_NOT_AUTHORISED", reason: err.message };
    }
    throw err;
  }

  let budgetRow;
  try {
    budgetRow = await assertBudgetApprovedForLaunch(distributionPlanId);
  } catch (err) {
    if (err instanceof BudgetNotApprovedError) {
      return { outcome: "BUDGET_NOT_APPROVED", reason: err.message };
    }
    throw err;
  }

  const routing = routeDistribution(plan.channel as ChannelType, plan.executionMode);
  if (routing.outcome === "NOT_AVAILABLE") {
    const [execution] = await db
      .insert(schema.distributionExecutions)
      .values({
        distributionPlanId,
        channel: plan.channel,
        adapterKey: "none",
        mode: plan.executionMode,
        status: "FAILED",
        errorCode: "ADAPTER_NOT_AVAILABLE",
        normalizedError: routing.reason,
        approvedBudget: budgetRow.approvedBudget,
        isSimulated: plan.executionMode === "SIMULATED",
        createdByUserId: actorUserId,
      })
      .returning();
    await recordAuditEvent({
      eventType: "EXECUTION_FAILED",
      actorUserId,
      targetType: "distribution_plan",
      targetId: distributionPlanId,
      metadata: { reason: routing.reason, marketAssetIds: assetAuthority.marketAssetIds },
    });
    return { outcome: "ADAPTER_NOT_AVAILABLE", executionId: execution!.id, reason: routing.reason };
  }

  try {
    const result = await routing.adapter.launch({
      distributionPlanId,
      channel: plan.channel as ChannelType,
      approvedBudget: Number(budgetRow.approvedBudget),
      currency: budgetRow.currency,
      destination: plan.destination,
      cta: plan.cta,
    });

    const [execution] = await db
      .insert(schema.distributionExecutions)
      .values({
        distributionPlanId,
        channel: plan.channel,
        adapterKey: routing.adapterKey,
        mode: plan.executionMode,
        externalExecutionId: result.externalExecutionId,
        startedAt: result.startedAt,
        status: result.status,
        approvedBudget: budgetRow.approvedBudget,
        isSimulated: routing.adapterKey === "simulated",
        createdByUserId: actorUserId,
      })
      .returning();

    await db
      .update(schema.distributionPlans)
      .set({ status: "RUNNING", updatedAt: new Date() })
      .where(eq(schema.distributionPlans.id, distributionPlanId));

    await recordAuditEvent({
      eventType: "EXECUTION_STARTED",
      actorUserId,
      targetType: "distribution_plan",
      targetId: distributionPlanId,
      metadata: {
        executionId: execution!.id,
        externalExecutionId: result.externalExecutionId,
        adapterKey: routing.adapterKey,
        isSimulated: routing.adapterKey === "simulated",
        marketAssetIds: assetAuthority.marketAssetIds,
      },
    });

    return { outcome: "LAUNCHED", executionId: execution!.id, externalExecutionId: result.externalExecutionId };
  } catch (err) {
    const normalized = routing.adapter.normalizeError(err);
    const [execution] = await db
      .insert(schema.distributionExecutions)
      .values({
        distributionPlanId,
        channel: plan.channel,
        adapterKey: routing.adapterKey,
        mode: plan.executionMode,
        status: "FAILED",
        errorCode: normalized.errorCode,
        normalizedError: normalized.normalizedError,
        approvedBudget: budgetRow.approvedBudget,
        isSimulated: routing.adapterKey === "simulated",
        createdByUserId: actorUserId,
      })
      .returning();

    await recordAuditEvent({
      eventType: "EXECUTION_FAILED",
      actorUserId,
      targetType: "distribution_plan",
      targetId: distributionPlanId,
      metadata: { errorCode: normalized.errorCode, marketAssetIds: assetAuthority.marketAssetIds },
    });

    return { outcome: "EXECUTION_ERROR", executionId: execution!.id, reason: normalized.normalizedError };
  }
}

export type PauseOutcome =
  | { outcome: "PAUSED" }
  | { outcome: "NOT_RUNNING"; reason: string };

export async function pause(distributionPlanId: string, actorUserId: string): Promise<PauseOutcome> {
  const [plan] = await db
    .select()
    .from(schema.distributionPlans)
    .where(eq(schema.distributionPlans.id, distributionPlanId))
    .limit(1);
  if (!plan) throw new Error("Distribution plan not found");
  if (plan.status !== "RUNNING") {
    return { outcome: "NOT_RUNNING", reason: `Plan status is ${plan.status}, not RUNNING.` };
  }

  const executions = await db
    .select()
    .from(schema.distributionExecutions)
    .where(eq(schema.distributionExecutions.distributionPlanId, distributionPlanId));
  const running = executions.find((e) => e.status === "RUNNING");
  if (!running || !running.externalExecutionId) {
    return { outcome: "NOT_RUNNING", reason: "No running execution found for this plan." };
  }

  const adapter = getDistributionAdapter(running.adapterKey);
  if (!adapter) throw new Error(`Adapter "${running.adapterKey}" is not registered.`);

  await adapter.pause(running.externalExecutionId);

  await db
    .update(schema.distributionExecutions)
    .set({ status: "PAUSED", updatedAt: new Date() })
    .where(eq(schema.distributionExecutions.id, running.id));

  await db
    .update(schema.distributionPlans)
    .set({ status: "PAUSED", updatedAt: new Date() })
    .where(eq(schema.distributionPlans.id, distributionPlanId));

  await recordAuditEvent({
    eventType: "EXECUTION_PAUSED",
    actorUserId,
    targetType: "distribution_plan",
    targetId: distributionPlanId,
    metadata: { executionId: running.id },
  });

  return { outcome: "PAUSED" };
}

export async function refreshExecutionStatus(executionId: string) {
  const [execution] = await db
    .select()
    .from(schema.distributionExecutions)
    .where(eq(schema.distributionExecutions.id, executionId))
    .limit(1);
  if (!execution || !execution.externalExecutionId) return execution ?? null;

  const adapter = getDistributionAdapter(execution.adapterKey);
  if (!adapter) return execution;

  const context = { approvedBudget: execution.approvedBudget !== null ? Number(execution.approvedBudget) : 0 };
  const spend = await adapter.spendSnapshot(execution.externalExecutionId, context);

  const [updated] = await db
    .update(schema.distributionExecutions)
    .set({
      reportedSpend: String(spend.amount),
      spendHistory: [...execution.spendHistory, { at: spend.at.toISOString(), amount: spend.amount }],
      updatedAt: new Date(),
    })
    .where(eq(schema.distributionExecutions.id, executionId))
    .returning();

  return updated ?? execution;
}

export const DistributionGateway = { launch, pause, refreshExecutionStatus };
