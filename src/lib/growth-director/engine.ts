import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { generateCandidates, type ActionType } from "./candidates";
import { rankCandidates } from "./ranking";
import { synthesizeGrowthRecommendations } from "@/lib/ai/tasks/synthesize-growth-recommendations";

// Orchestration for the Growth Director recommendation lifecycle —
// generate (deterministic candidates → ranking → optional AI narrative →
// persist) and query ("what should SecurePay do next?"). See
// src/lib/growth-director/candidates.ts and ranking.ts for the two layers
// this composes.

const RECOMMENDATION_LIFETIME_DAYS = 14;

const OPEN_STATUSES = ["PROPOSED", "NEEDS_REVIEW"] as const;
const CURRENT_STATUSES = ["PROPOSED", "NEEDS_REVIEW", "APPROVED"] as const;

const SUGGESTED_OWNER: Record<ActionType, string> = {
  INVESTIGATE_OPPORTUNITY: "STRATEGIST",
  CREATE_CAMPAIGN: "STRATEGIST",
  REVISE_POSITIONING: "STRATEGIST",
  SHIFT_CHANNEL_PRIORITY: "DISTRIBUTION_SALES",
  PAUSE_LOW_VALUE_PLAN: "DISTRIBUTION_SALES",
  INCREASE_BUDGET_REQUEST: "OWNER",
  REDUCE_BUDGET_REQUEST: "OWNER",
  RUN_EXPERIMENT: "STRATEGIST",
  IMPROVE_ONBOARDING: "OWNER",
  RECOVER_JOURNEY: "DISTRIBUTION_SALES",
  UPSELL_SEGMENT: "DISTRIBUTION_SALES",
  REENGAGE_SEGMENT: "DISTRIBUTION_SALES",
  REVIEW_MODEL: "OWNER",
  REDUCE_AI_COST: "OWNER",
  NO_ACTION: "OWNER",
};

const NEXT_STEP: Record<ActionType, string> = {
  INVESTIGATE_OPPORTUNITY: "Review the opportunity and decide whether to approve it for campaign planning.",
  CREATE_CAMPAIGN: "Draft a campaign from the referenced opportunity.",
  REVISE_POSITIONING: "Review creative/messaging against Brand Guardian and revise the weak-performing angle.",
  SHIFT_CHANNEL_PRIORITY: "Re-run channel recommendations and adjust plan priority.",
  PAUSE_LOW_VALUE_PLAN: "Pause the referenced distribution plan.",
  INCREASE_BUDGET_REQUEST: "Propose and approve an increased budget on the referenced plan.",
  REDUCE_BUDGET_REQUEST: "Propose a reduced budget on the referenced plan.",
  RUN_EXPERIMENT: "Create an experiment with at least 2 variants for the referenced campaign.",
  IMPROVE_ONBOARDING: "Investigate the activation step referenced in the evidence for product friction.",
  RECOVER_JOURNEY: "Review the abandoned-journey cohort and prepare approved recovery outreach.",
  UPSELL_SEGMENT: "Prepare a targeted distribution plan for the upsell-eligible cohort.",
  REENGAGE_SEGMENT: "Prepare a re-engagement distribution plan for the dormant cohort.",
  REVIEW_MODEL: "Review the referenced model recommendation and approve/reject the routing change.",
  REDUCE_AI_COST: "Review AI budget policy and current spend against it.",
  NO_ACTION: "No action needed this cycle.",
};

export interface GenerateOptions {
  useAiNarrative?: boolean;
  requestedByUserId?: string;
  generatedByUserId?: string | null;
}

// Supersedes every still-open recommendation from a prior generation run
// (never touches APPROVED/REJECTED/ACTIONED — historical decisions are
// preserved), then generates a fresh batch. This is the append-with-
// supersede pattern already used for budget_approvals (Phase 3).
export async function generateAndPersistRecommendations(options: GenerateOptions = {}) {
  const openRows = await db
    .select({ id: schema.growthRecommendations.id })
    .from(schema.growthRecommendations)
    .where(inArray(schema.growthRecommendations.status, [...OPEN_STATUSES]));
  if (openRows.length > 0) {
    await db
      .update(schema.growthRecommendations)
      .set({ status: "SUPERSEDED", updatedAt: new Date() })
      .where(inArray(schema.growthRecommendations.id, openRows.map((r) => r.id)));
  }

  const candidates = await generateCandidates();
  const ranked = rankCandidates(candidates);

  const expiresAt = new Date(Date.now() + RECOMMENDATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(schema.growthRecommendations)
    .values(
      ranked.map(({ candidate, score, explanation }) => ({
        title: candidate.title,
        actionType: candidate.actionType,
        priority: candidate.priority,
        expectedImpact: candidate.expectedImpact,
        evidence: candidate.evidence,
        supportingMetrics: candidate.supportingMetrics,
        affectedPillars: candidate.affectedPillars,
        campaignId: candidate.campaignId ?? null,
        audienceSegmentId: candidate.audienceSegmentId ?? null,
        organizationId: candidate.organizationId ?? null,
        experimentId: candidate.experimentId ?? null,
        learningId: candidate.learningId ?? null,
        productReference: candidate.productReference ?? null,
        reason: candidate.reason,
        confidence: candidate.confidence,
        riskLevel: candidate.riskLevel,
        costImplication: candidate.costImplication ?? null,
        humanApprovalRequired: candidate.humanApprovalRequired,
        status: "PROPOSED" as const,
        generatedBy: "deterministic-engine",
        rankingScore: String(score),
        rankingExplanation: explanation,
        expiresAt,
        isDemo: candidate.isDemo,
      }))
    )
    .returning();

  let aiEnrichmentCount = 0;
  if (options.useAiNarrative && options.requestedByUserId && inserted.length > 0) {
    const topForSynthesis = inserted.slice(0, 7);
    const synthesis = await synthesizeGrowthRecommendations({
      candidates: topForSynthesis.map((r) => ({ id: r.id, title: r.title, actionType: r.actionType, reason: r.reason, priority: r.priority, confidence: r.confidence })),
      requestedByUserId: options.requestedByUserId,
    });
    for (const row of topForSynthesis) {
      const narrative = synthesis.notesByRecommendationId.get(row.id);
      if (!narrative) continue;
      await db
        .update(schema.growthRecommendations)
        .set({ reason: `${row.reason} ${narrative}`, aiEnrichmentUsed: true, aiUsageRecordId: synthesis.aiUsageRecordId, updatedAt: new Date() })
        .where(eq(schema.growthRecommendations.id, row.id));
      aiEnrichmentCount++;
    }
  }

  await recordAuditEvent({
    eventType: "GROWTH_RECOMMENDATION_GENERATED",
    actorUserId: options.generatedByUserId ?? undefined,
    targetType: "growth_recommendation_batch",
    metadata: { count: inserted.length, aiEnrichmentCount, supersededCount: openRows.length },
  });

  return inserted;
}

export async function listCurrentRecommendations() {
  const rows = await db
    .select()
    .from(schema.growthRecommendations)
    .where(inArray(schema.growthRecommendations.status, [...CURRENT_STATUSES]))
    .orderBy(desc(schema.growthRecommendations.rankingScore));
  return rows;
}

export interface WhatShouldWeDoNextItem {
  id: string;
  recommendation: string;
  why: string;
  evidence: Record<string, unknown>;
  expectedOutcome: string;
  costImplication: string | null;
  risk: string;
  confidence: string;
  pillars: string[];
  suggestedOwner: string;
  approvalRequired: boolean;
  nextStep: string;
  status: string;
  rankingScore: number | null;
  isDemo: boolean;
}

// The first-class "What should SecurePay do next?" query — Section 19.
// Returns 3-7 items when available; never fabricates generic advice — if
// fewer than 3 real candidates exist, it returns however many are real
// (including a single NO_ACTION), rather than padding with invented ones.
export async function whatShouldSecurePayDoNext(limit = 7): Promise<WhatShouldWeDoNextItem[]> {
  const current = await listCurrentRecommendations();
  return current.slice(0, Math.max(3, Math.min(limit, current.length))).map((r) => ({
    id: r.id,
    recommendation: r.title,
    why: r.reason,
    evidence: r.evidence,
    expectedOutcome: r.expectedImpact,
    costImplication: r.costImplication,
    risk: r.riskLevel,
    confidence: r.confidence,
    pillars: r.affectedPillars,
    suggestedOwner: SUGGESTED_OWNER[r.actionType],
    approvalRequired: r.humanApprovalRequired,
    nextStep: NEXT_STEP[r.actionType],
    status: r.status,
    rankingScore: r.rankingScore !== null ? Number(r.rankingScore) : null,
    isDemo: r.isDemo,
  }));
}

export async function getRecommendation(id: string) {
  const rows = await db.select().from(schema.growthRecommendations).where(eq(schema.growthRecommendations.id, id)).limit(1);
  return rows[0] ?? null;
}

// Deterministic on-demand sweep — no scheduler (Section 31). Expires
// open recommendations past their expiresAt.
export async function expireStaleRecommendations(now: Date = new Date()): Promise<number> {
  const stale = await db
    .select({ id: schema.growthRecommendations.id })
    .from(schema.growthRecommendations)
    .where(and(inArray(schema.growthRecommendations.status, [...OPEN_STATUSES]), lte(schema.growthRecommendations.expiresAt, now)));

  if (stale.length === 0) return 0;
  await db
    .update(schema.growthRecommendations)
    .set({ status: "EXPIRED", updatedAt: new Date() })
    .where(inArray(schema.growthRecommendations.id, stale.map((r) => r.id)));
  return stale.length;
}
