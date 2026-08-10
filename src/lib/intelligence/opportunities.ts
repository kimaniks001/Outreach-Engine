import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { analyzeSignal } from "@/lib/ai/tasks/analyze-signal";
import { listEvidenceForSignal } from "./evidence";
import { getSignal, markSignalAnalyzed } from "./signals";
import type { StructuredTaskResult } from "@/lib/ai/tasks/run-structured-task";
import type { AnalyzedOpportunity } from "@/lib/ai/tasks/analyze-signal";

// Orchestrates the full "analyse signal → structured opportunity" flow
// (Phase 2 brief Sections 9 + 12). Never creates a fabricated opportunity
// on a failed/malformed AI response — the caller (API route) is expected to
// surface the failure and allow a retry, per Section 12's "reject
// malformed AI responses safely".
export async function analyzeSignalAndCreateOpportunity(
  marketSignalId: string,
  actorUserId: string
): Promise<
  | { ok: true; opportunity: typeof schema.opportunities.$inferSelect }
  | { ok: false; result: StructuredTaskResult<AnalyzedOpportunity> }
> {
  const signal = await getSignal(marketSignalId);
  if (!signal) throw new Error("Signal not found");

  const evidenceRows = await listEvidenceForSignal(marketSignalId);

  const result = await analyzeSignal({
    signal: { title: signal.title, summary: signal.summary, signalType: signal.signalType },
    evidence: evidenceRows.map((e) => ({
      sourceName: e.sourceName,
      extractedClaim: e.extractedClaim,
      verificationStatus: e.verificationStatus,
      confidence: Number(e.confidence),
    })),
    requestedByUserId: actorUserId,
  });

  if (result.status !== "SUCCESS") {
    return { ok: false, result };
  }

  const analysis = result.data;

  const [opportunity] = await db
    .insert(schema.opportunities)
    .values({
      marketSignalId,
      title: `Opportunity: ${signal.title}`,
      problem: analysis.raw.problem,
      targetAudience: analysis.raw.targetAudience,
      affectedSector: analysis.raw.sector || null,
      geography: analysis.raw.geography || null,
      securepayRelevance: analysis.raw.securepayRelevance,
      moneyFlowMapping: analysis.moneyFlowMapping,
      productNote: analysis.raw.productNote || null,
      evidenceSummary: analysis.raw.evidenceReasoning,
      confidence: String(evidenceRows.length > 0 ? Math.max(...evidenceRows.map((e) => Number(e.confidence))) : 0.2),
      opportunityScore: analysis.totalScore,
      urgency: scoreToUrgency(analysis.scoreComponents.urgencyTiming),
      estimatedCommercialPotential: null, // Phase 2 does not fabricate commercial estimates — see docs
      recommendedMarketingAngle: null,
      recommendedCta: null,
      risksCaveats: analysis.raw.caveats || null,
      // Straight to NEEDS_REVIEW — an AI-analyzed opportunity is already a
      // complete candidate for Owner review, not a manual work-in-progress.
      // DRAFT remains available for a possible future manual-entry path.
      status: "NEEDS_REVIEW",
      aiUsageRecordId: analysis.usageRecordId,
      classification: "CONFIDENTIAL",
      isDemo: signal.isDemo,
      createdByUserId: actorUserId,
    })
    .returning();

  await db.insert(schema.opportunityScores).values({
    opportunityId: opportunity!.id,
    problemFit: analysis.scoreComponents.problemFit,
    securepayFit: analysis.scoreComponents.securepayFit,
    audienceClarity: analysis.scoreComponents.audienceClarity,
    commercialValue: analysis.scoreComponents.commercialValue,
    reachability: analysis.scoreComponents.reachability,
    evidenceStrength: analysis.scoreComponents.evidenceStrength,
    urgencyTiming: analysis.scoreComponents.urgencyTiming,
    totalScore: analysis.totalScore,
    explanation: {
      problemFit: analysis.raw.evidenceReasoning,
      evidenceStrength:
        evidenceRows.length === 0
          ? "No source evidence attached — MANUAL/UNVERIFIED, scored at the floor."
          : `Derived from ${evidenceRows.length} evidence record(s).`,
    },
    aiProposed: true,
  });

  await markSignalAnalyzed(marketSignalId);

  await recordAuditEvent({
    eventType: "OPPORTUNITY_ANALYZED",
    actorUserId,
    targetType: "opportunity",
    targetId: opportunity!.id,
    metadata: { marketSignalId, provider: analysis.provider, model: analysis.model, isMock: analysis.isMock, totalScore: analysis.totalScore },
  });

  return { ok: true, opportunity: opportunity! };
}

function scoreToUrgency(urgencyTimingScore: number): "LOW" | "MEDIUM" | "HIGH" {
  if (urgencyTimingScore >= 70) return "HIGH";
  if (urgencyTimingScore >= 40) return "MEDIUM";
  return "LOW";
}

export interface OpportunityListFilters {
  status?: Array<(typeof schema.opportunityStatusEnum.enumValues)[number]>;
  minScore?: number;
}

export async function listOpportunities(filters: OpportunityListFilters = {}) {
  const rows = await db.select().from(schema.opportunities).orderBy(desc(schema.opportunities.createdAt));
  return rows.filter((r) => {
    if (filters.status && !filters.status.includes(r.status)) return false;
    if (filters.minScore !== undefined && r.opportunityScore < filters.minScore) return false;
    return true;
  });
}

export async function getOpportunity(id: string) {
  const rows = await db.select().from(schema.opportunities).where(eq(schema.opportunities.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getOpportunityScore(opportunityId: string) {
  const rows = await db
    .select()
    .from(schema.opportunityScores)
    .where(eq(schema.opportunityScores.opportunityId, opportunityId))
    .limit(1);
  return rows[0] ?? null;
}

export type OpportunityReviewAction = "APPROVE" | "REJECT" | "ARCHIVE";

// Owner-only, enforced by the caller (src/lib/rbac) — see
// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md's RBAC section for why
// opportunity approve/reject stays Owner-only under the literal Phase 0
// grant table.
export async function reviewOpportunity(
  id: string,
  action: OpportunityReviewAction,
  actorUserId: string,
  notes?: string
) {
  const status = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "ARCHIVED";

  const [row] = await db
    .update(schema.opportunities)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.opportunities.id, id))
    .returning();

  await db.insert(schema.approvalEvents).values({
    subjectType: "opportunity",
    subjectId: id,
    action: action === "APPROVE" ? "APPROVE" : action === "REJECT" ? "REJECT" : "REVISION_REQUESTED",
    actorUserId,
    notes: notes ?? null,
  });

  await recordAuditEvent({
    eventType: "OPPORTUNITY_REVIEWED",
    actorUserId,
    targetType: "opportunity",
    targetId: id,
    metadata: { action, status },
  });

  return row ?? null;
}
