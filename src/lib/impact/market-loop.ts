import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { computeCampaignScorecard } from "./scorecards";
import { getCampaignMarketKitLearning } from "@/lib/market-learning/market-learning";
import { generateCandidates } from "@/lib/growth-director/candidates";

export async function listRapidResponseSignals() {
  const rows = await db
    .select()
    .from(schema.marketSignals)
    .where(eq(schema.marketSignals.status, "NEW"))
    .orderBy(desc(schema.marketSignals.createdAt));

  return rows.filter((row) => row.tags.some((tag) => tag.startsWith("rapid-response:")));
}

/**
 * Completion Phase 5's customer-language brief. Metrics are reported as
 * observations, interpretations are explicitly cautious, and recommended
 * actions come from the existing deterministic Growth Director candidate
 * engine. No click/reach/Market Kit count is promoted into commercial truth.
 */
export async function getCampaignMarketResponseBrief(campaignId: string) {
  const [scorecard, marketKit, candidates] = await Promise.all([
    computeCampaignScorecard(campaignId),
    getCampaignMarketKitLearning(campaignId),
    generateCandidates(),
  ]);

  const campaignCandidates = candidates
    .filter((candidate) => candidate.campaignId === campaignId)
    .slice(0, 5)
    .map((candidate) => ({
      title: candidate.title,
      actionType: candidate.actionType,
      reason: candidate.reason,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      expectedImpact: candidate.expectedImpact,
      humanApprovalRequired: candidate.humanApprovalRequired,
    }));

  const whatHappened = {
    observedReach: scorecard.reach,
    observedEngagement: scorecard.engagement,
    attributedConversions: scorecard.attributedConversions,
    agreementCompletions: scorecard.agreementCompletion,
    repeatUse: scorecard.repeatUse,
    measuredSpend: scorecard.spend,
    marketKitUsageEvents: marketKit.observedUsageEvents,
  };

  const whatItMeans = scorecard.reach === 0 && marketKit.observedUsageEvents === 0
    ? "There is not yet enough observed market activity to judge this campaign. Absence of recorded activity is not proof of zero real-world exposure."
    : scorecard.attributedConversions === 0
      ? "Market activity has been observed, but no meaningful conversion is currently attributable to this campaign. Reach or asset use alone should not be treated as business success."
      : `${scorecard.attributedConversions} meaningful conversion(s) are currently attributable to this campaign under the recorded attribution model. This is observed evidence, not a guarantee that the campaign alone caused the outcome.`;

  return {
    campaignId,
    whatHappened,
    whatItMeans,
    whatCanIDoNext: campaignCandidates.length > 0
      ? campaignCandidates
      : [{
          title: "Keep measuring before changing course",
          actionType: "NO_ACTION",
          reason: "No campaign-specific deterministic Growth Director recommendation currently meets an action threshold.",
          confidence: "MEDIUM",
          evidence: whatHappened,
          expectedImpact: "Avoids reacting to weak or vanity-only evidence.",
          humanApprovalRequired: false,
        }],
    marketKit,
    dropOffFindings: scorecard.dropOffFindings,
  };
}

export async function getRapidResponseQueue() {
  const signals = await listRapidResponseSignals();
  return signals.map((signal) => ({
    signalId: signal.id,
    title: signal.title,
    summary: signal.summary,
    reason: signal.tags.find((tag) => tag.startsWith("rapid-response:"))?.replace("rapid-response:", "") ?? "unknown",
    status: signal.status,
    nextStep: "Review the evidence, then use the normal opportunity → campaign → Brand/Compliance/Legal → Market Release path. Rapid response changes priority, not approval authority.",
    autoPublishAllowed: false,
    autoSpendAllowed: false,
  }));
}
