import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

// Centralized budget policy service — docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md
// Section 15. budget_approvals is append-only per plan (never edited in
// place); the current effective budget is the single row with status
// APPROVED — approveBudget() supersedes any prior APPROVED row so there is
// never more than one active approval at a time.

export class BudgetNotApprovedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetNotApprovedError";
  }
}

export interface ProposeBudgetInput {
  distributionPlanId: string;
  plannedBudget: number;
  currency: string;
  dailyCap?: number | null;
  totalCap?: number | null;
  providerAccountReference?: string | null;
  notes?: string | null;
}

async function latestBudgetRow(distributionPlanId: string) {
  const rows = await db
    .select()
    .from(schema.budgetApprovals)
    .where(eq(schema.budgetApprovals.distributionPlanId, distributionPlanId))
    .orderBy(desc(schema.budgetApprovals.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

// No silent budget increase: a plan already RUNNING must be paused before
// its budget can be re-proposed — proposing mid-flight would otherwise let
// a budget change take effect on a live execution with no re-approval step
// in between.
export async function proposeBudget(input: ProposeBudgetInput, actorUserId: string) {
  if (input.plannedBudget < 0) throw new Error("Planned budget cannot be negative.");
  if (input.dailyCap !== undefined && input.dailyCap !== null && input.dailyCap < 0) {
    throw new Error("Daily cap cannot be negative.");
  }
  if (input.totalCap !== undefined && input.totalCap !== null && input.totalCap < 0) {
    throw new Error("Total cap cannot be negative.");
  }

  const [plan] = await db
    .select()
    .from(schema.distributionPlans)
    .where(eq(schema.distributionPlans.id, input.distributionPlanId))
    .limit(1);
  if (!plan) throw new Error("Distribution plan not found");
  if (plan.status === "RUNNING") {
    throw new Error("Cannot propose a new budget while the plan is RUNNING — pause it first.");
  }

  const [row] = await db
    .insert(schema.budgetApprovals)
    .values({
      distributionPlanId: input.distributionPlanId,
      plannedBudget: String(input.plannedBudget),
      currency: input.currency,
      dailyCap: input.dailyCap !== undefined && input.dailyCap !== null ? String(input.dailyCap) : null,
      totalCap: input.totalCap !== undefined && input.totalCap !== null ? String(input.totalCap) : null,
      status: "PROPOSED",
      providerAccountReference: input.providerAccountReference ?? null,
      proposedByUserId: actorUserId,
      notes: input.notes ?? null,
    })
    .returning();

  // A previously-approved plan needs re-approval after any budget change —
  // no silent increase. Only touches plan.status when it had progressed
  // beyond AWAITING_APPROVAL; DRAFT/NEEDS_REVIEW stay as-is.
  if (["APPROVED", "READY"].includes(plan.status)) {
    await db
      .update(schema.distributionPlans)
      .set({ status: "AWAITING_APPROVAL", updatedAt: new Date() })
      .where(eq(schema.distributionPlans.id, input.distributionPlanId));
  }

  await recordAuditEvent({
    eventType: "BUDGET_PROPOSED",
    actorUserId,
    targetType: "distribution_plan",
    targetId: input.distributionPlanId,
    metadata: { plannedBudget: input.plannedBudget, currency: input.currency },
  });

  return row!;
}

// Owner-only — enforced by the caller via requireApiCapability (approve on
// `distribution`), per the literal docs/ACCESS_CONTROL_MODEL.md Section 4
// grant table: GROWTH_DIRECTOR has view-only on `distribution` (no
// `approve`), unlike its explicit approve grant on `campaigns`. See
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md's RBAC reading-decision note.
export async function approveBudget(
  distributionPlanId: string,
  actorUserId: string,
  approvedBudget?: number
) {
  const latest = await latestBudgetRow(distributionPlanId);
  if (!latest || latest.status !== "PROPOSED") {
    throw new BudgetNotApprovedError("No pending budget proposal to approve for this plan.");
  }

  const finalBudget = approvedBudget ?? Number(latest.plannedBudget);
  if (finalBudget < 0) throw new Error("Approved budget cannot be negative.");
  if (latest.totalCap !== null && finalBudget > Number(latest.totalCap)) {
    throw new Error(`Approved budget (${finalBudget}) cannot exceed the total cap (${latest.totalCap}).`);
  }

  // Supersede any prior APPROVED row so exactly one is ever active.
  await db
    .update(schema.budgetApprovals)
    .set({ status: "SUPERSEDED" })
    .where(eq(schema.budgetApprovals.distributionPlanId, distributionPlanId));

  const [row] = await db
    .update(schema.budgetApprovals)
    .set({ status: "APPROVED", approvedBudget: String(finalBudget), approvedByUserId: actorUserId })
    .where(eq(schema.budgetApprovals.id, latest.id))
    .returning();

  await recordAuditEvent({
    eventType: "BUDGET_APPROVED",
    actorUserId,
    targetType: "distribution_plan",
    targetId: distributionPlanId,
    metadata: { approvedBudget: finalBudget, currency: latest.currency },
  });

  return row!;
}

export async function getCurrentBudget(distributionPlanId: string) {
  return latestBudgetRow(distributionPlanId);
}

// Used by the Today dashboard — a plain count, no fabricated figures.
export async function countApprovedBudgets(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.budgetApprovals)
    .where(eq(schema.budgetApprovals.status, "APPROVED"));
  return rows[0]?.count ?? 0;
}

export async function listBudgetHistory(distributionPlanId: string) {
  return db
    .select()
    .from(schema.budgetApprovals)
    .where(eq(schema.budgetApprovals.distributionPlanId, distributionPlanId))
    .orderBy(desc(schema.budgetApprovals.createdAt));
}

// Throws BudgetNotApprovedError unless the latest budget state is APPROVED
// with a non-negative approvedBudget — the gateway calls this before every
// launch attempt (src/lib/distribution/gateway.ts). No launch above cap: a
// cumulative-spend check against totalCap happens at the gateway using this
// row's totalCap/approvedBudget once execution history exists.
export async function assertBudgetApprovedForLaunch(distributionPlanId: string) {
  const latest = await latestBudgetRow(distributionPlanId);
  if (!latest) throw new BudgetNotApprovedError("No budget has been proposed for this plan.");
  if (latest.status !== "APPROVED") {
    throw new BudgetNotApprovedError(
      `Budget is not approved (latest state: ${latest.status}) — re-approval is required before launch.`
    );
  }
  if (latest.approvedBudget === null || Number(latest.approvedBudget) < 0) {
    throw new BudgetNotApprovedError("Approved budget is missing or negative.");
  }
  return latest;
}
