import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import type { Role } from "@/lib/rbac/roles";
import { getRecommendation } from "./engine";
import { DistributionGateway } from "@/lib/distribution/gateway";
import { createExperiment } from "@/lib/experiments/experiments";

// Human approval + the action bridge — Phase 5 brief Sections 36-37.
// Growth Director recommendations never execute anything by themselves;
// every transition here requires an explicit, role-checked human call.

export class ApprovalError extends Error {}

// LOW/MEDIUM risk: Owner or Growth Director (mirrors the `approve` on
// `campaigns` capability both already hold). HIGH risk (budget, paid-
// media, bulk outreach, pricing, compliance, high-impact model routing)
// is Owner-only regardless of caller role — enforced here as a service-
// layer rule on top of the API route's RBAC gate, the same "approve
// capability is necessary but not sufficient" layering Phase 3 used for
// distribution budget approval.
function assertCanApprove(recommendation: typeof schema.growthRecommendations.$inferSelect, actorRole: Role) {
  if (recommendation.riskLevel === "HIGH") {
    if (actorRole !== "OWNER") {
      throw new ApprovalError("HIGH-risk recommendations (budget/paid-media/bulk-outreach/pricing/compliance/model-routing) require OWNER approval.");
    }
    return;
  }
  if (actorRole !== "OWNER" && actorRole !== "GROWTH_DIRECTOR") {
    throw new ApprovalError("Only OWNER or GROWTH_DIRECTOR may approve a Growth Director recommendation.");
  }
}

export async function approveRecommendation(id: string, actorUserId: string, actorRole: Role, notes?: string) {
  const recommendation = await getRecommendation(id);
  if (!recommendation) throw new Error("Recommendation not found");
  if (recommendation.status !== "PROPOSED" && recommendation.status !== "NEEDS_REVIEW") {
    throw new Error(`Recommendation is ${recommendation.status}; only PROPOSED/NEEDS_REVIEW recommendations can be approved.`);
  }

  assertCanApprove(recommendation, actorRole);

  const [row] = await db
    .update(schema.growthRecommendations)
    .set({ status: "APPROVED", reviewedByUserId: actorUserId, reviewedAt: new Date(), reviewNotes: notes ?? null, updatedAt: new Date() })
    .where(eq(schema.growthRecommendations.id, id))
    .returning();

  await recordAuditEvent({
    eventType: "GROWTH_RECOMMENDATION_APPROVED",
    actorUserId,
    targetType: "growth_recommendation",
    targetId: id,
    metadata: { actionType: recommendation.actionType, riskLevel: recommendation.riskLevel },
  });

  return row ?? null;
}

// Rejecting is always the safe direction — Owner or Growth Director, no
// risk-tier gate needed (mirrors "pause" being gated one level lower than
// "launch" in Phase 3).
export async function rejectRecommendation(id: string, actorUserId: string, actorRole: Role, notes?: string) {
  if (actorRole !== "OWNER" && actorRole !== "GROWTH_DIRECTOR") {
    throw new ApprovalError("Only OWNER or GROWTH_DIRECTOR may reject a Growth Director recommendation.");
  }

  const [row] = await db
    .update(schema.growthRecommendations)
    .set({ status: "REJECTED", reviewedByUserId: actorUserId, reviewedAt: new Date(), reviewNotes: notes ?? null, updatedAt: new Date() })
    .where(eq(schema.growthRecommendations.id, id))
    .returning();

  if (row) {
    await recordAuditEvent({
      eventType: "GROWTH_RECOMMENDATION_REJECTED",
      actorUserId,
      targetType: "growth_recommendation",
      targetId: id,
      metadata: { actionType: row.actionType },
    });
  }

  return row ?? null;
}

export interface ActionOutcome {
  status: "ACTIONED" | "BLOCKED" | "NO_DOWNSTREAM_ACTION";
  message: string;
  actionReferenceType: string | null;
  actionReferenceId: string | null;
}

// The action bridge (Section 37) — Owner-only, requires the recommendation
// to already be APPROVED. Only ever PREPARES downstream work (drafts,
// or the "pause" safe-direction action) — never launches paid media,
// sends bulk outreach, or changes budgets/pricing/doctrine. Action types
// with no safe automated bridge are recorded ACTIONED (a human completed
// the work outside the system) rather than silently failing.
export async function actionRecommendation(id: string, actorUserId: string): Promise<ActionOutcome> {
  const recommendation = await getRecommendation(id);
  if (!recommendation) throw new Error("Recommendation not found");
  if (recommendation.status !== "APPROVED") {
    throw new Error(`Recommendation is ${recommendation.status}; only APPROVED recommendations can be actioned.`);
  }

  let outcome: ActionOutcome;

  switch (recommendation.actionType) {
    case "INCREASE_BUDGET_REQUEST":
    case "REDUCE_BUDGET_REQUEST":
      outcome = {
        status: "BLOCKED",
        message: "Budget changes are never automated by Growth Director — propose/approve the new budget manually via Distribution.",
        actionReferenceType: null,
        actionReferenceId: null,
      };
      break;

    case "PAUSE_LOW_VALUE_PLAN": {
      const planId = (recommendation.evidence as { distributionPlanId?: string }).distributionPlanId;
      if (!planId) {
        outcome = { status: "NO_DOWNSTREAM_ACTION", message: "No distribution plan reference in evidence.", actionReferenceType: null, actionReferenceId: null };
        break;
      }
      const pauseOutcome = await DistributionGateway.pause(planId, actorUserId);
      outcome =
        pauseOutcome.outcome === "PAUSED"
          ? { status: "ACTIONED", message: "Distribution plan paused.", actionReferenceType: "distribution_plan", actionReferenceId: planId }
          : { status: "BLOCKED", message: `Pause did not complete: ${pauseOutcome.outcome}`, actionReferenceType: "distribution_plan", actionReferenceId: planId };
      break;
    }

    case "RUN_EXPERIMENT": {
      const campaignId = (recommendation.evidence as { campaignId?: string }).campaignId ?? recommendation.campaignId;
      if (!campaignId) {
        outcome = { status: "NO_DOWNSTREAM_ACTION", message: "No campaign reference in evidence.", actionReferenceType: null, actionReferenceId: null };
        break;
      }
      const experiment = await createExperiment(
        {
          name: `${recommendation.title} (from Growth Director)`,
          hypothesis: recommendation.reason,
          campaignId,
          primaryMetric: "TBD — set a real conversion-type primary metric before planning",
          expectedOutcome: recommendation.expectedImpact,
          isDemo: recommendation.isDemo,
        },
        actorUserId
      );
      outcome = { status: "ACTIONED", message: "Experiment draft created.", actionReferenceType: "experiment", actionReferenceId: experiment.id };
      break;
    }

    default:
      outcome = {
        status: "ACTIONED",
        message: "Marked actioned — this recommendation type has no automated downstream artifact; the follow-through happens outside the system.",
        actionReferenceType: null,
        actionReferenceId: null,
      };
  }

  // BLOCKED/NO_DOWNSTREAM_ACTION never advance status — the recommendation
  // stays APPROVED so it can be retried or completed manually; only a real
  // ACTIONED outcome moves the record to its terminal state.
  if (outcome.status === "ACTIONED") {
    await db
      .update(schema.growthRecommendations)
      .set({
        status: "ACTIONED",
        actionReferenceType: outcome.actionReferenceType,
        actionReferenceId: outcome.actionReferenceId,
        updatedAt: new Date(),
      })
      .where(eq(schema.growthRecommendations.id, id));
  }

  await recordAuditEvent({
    eventType: "GROWTH_RECOMMENDATION_ACTIONED",
    actorUserId,
    targetType: "growth_recommendation",
    targetId: id,
    metadata: { actionType: recommendation.actionType, outcome: outcome.status, actionReferenceType: outcome.actionReferenceType, actionReferenceId: outcome.actionReferenceId },
  });

  return outcome;
}
