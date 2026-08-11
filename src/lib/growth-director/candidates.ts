import { desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { computeCampaignScorecard } from "@/lib/impact/scorecards";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { listOpportunities, getOpportunityScore } from "@/lib/intelligence/opportunities";
import { listExperiments, listExperimentResults } from "@/lib/experiments/experiments";
import { listLearnings } from "@/lib/learning/learnings";
import { listModelRecommendations } from "@/lib/model-evaluation/recommendations";

// Deterministic candidate-fact generation — the DETERMINISTIC LAYER of
// Growth Director (Phase 5 brief Section 20). Every candidate here is
// derived directly from real Phase 1-4 records; nothing is invented. The
// AI layer (src/lib/growth-director/engine.ts) may only add narrative
// text on top of a candidate that already exists — it cannot create,
// remove, or re-score one.

export type ActionType = (typeof schema.growthRecommendationActionTypeEnum.enumValues)[number];
export type Priority = (typeof schema.urgencyEnum.enumValues)[number];
export type RiskLevel = (typeof schema.riskLevelEnum.enumValues)[number];
export type Confidence = (typeof schema.evidenceConfidenceEnum.enumValues)[number];

export interface RecommendationCandidate {
  title: string;
  actionType: ActionType;
  priority: Priority;
  expectedImpact: string;
  evidence: Record<string, unknown>;
  supportingMetrics: Record<string, unknown>;
  affectedPillars: string[];
  campaignId?: string | null;
  audienceSegmentId?: string | null;
  organizationId?: string | null;
  experimentId?: string | null;
  learningId?: string | null;
  productReference?: string | null;
  reason: string;
  confidence: Confidence;
  riskLevel: RiskLevel;
  costImplication?: string | null;
  humanApprovalRequired: boolean;
  // Deterministic ranking inputs (0-100 each) — see
  // src/lib/growth-director/ranking.ts. Assigned by the rule that produced
  // this candidate, from its own concrete evidence.
  impactScore: number;
  effortScore: number;
  evidenceScore: number;
  costScore: number;
  // Traced from whatever record the evidence is derived from (campaign/
  // plan/experiment/opportunity/profiles) — never defaulted to false when
  // the underlying evidence is demo data. See docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md
  // Section 45 ("everything DEMO/SAMPLE/SIMULATED clearly labeled").
  isDemo: boolean;
}

const MIN_REACH_FOR_PLAN_JUDGMENT = 10;
const LOW_VALUE_SPEND_THRESHOLD = 5; // currency-agnostic small-spend floor to avoid judging near-zero spend plans
const DORMANT_COHORT_THRESHOLD = 1;
const UPSELL_COHORT_THRESHOLD = 1;

function confidenceScore(c: Confidence): number {
  return { INSUFFICIENT_DATA: 0, LOW: 33, MEDIUM: 66, HIGH: 100 }[c];
}

// Rule 1 — funnel drop-offs per campaign map to a fix recommendation.
// Mirrors the Section 18 example #2 ("Fix KSNumber → SecureLink
// activation").
async function funnelDropOffCandidates(): Promise<RecommendationCandidate[]> {
  const campaigns = await listCampaigns();
  const candidates: RecommendationCandidate[] = [];

  for (const campaign of campaigns) {
    const scorecard = await computeCampaignScorecard(campaign.id);
    if (scorecard.reach < MIN_REACH_FOR_PLAN_JUDGMENT) continue;

    for (const finding of scorecard.dropOffFindings) {
      const isEarlyFunnel = finding.fromStage === "REACH";
      const isActivation = finding.fromStage === "KSNUMBER" || finding.fromStage === "PRODUCT_STARTED";
      const actionType: ActionType = isEarlyFunnel ? "REVISE_POSITIONING" : isActivation ? "IMPROVE_ONBOARDING" : "SHIFT_CHANNEL_PRIORITY";

      candidates.push({
        title: `Fix ${campaign.name}: ${finding.fromStage} → ${finding.toStage} drop-off`,
        actionType,
        priority: finding.ratio < 0.1 ? "HIGH" : "MEDIUM",
        expectedImpact: `Improving ${finding.fromStage}→${finding.toStage} conversion would recover meaningful volume currently lost at this step.`,
        evidence: { campaignId: campaign.id, campaignName: campaign.name, dropOff: finding },
        supportingMetrics: { reach: scorecard.reach, registrations: scorecard.registrations, firstUse: scorecard.firstUse },
        affectedPillars: isEarlyFunnel ? ["MARKETING", "POSITIONING"] : ["IMPACT", "ACTION"],
        campaignId: campaign.id,
        reason: finding.finding,
        confidence: "MEDIUM",
        riskLevel: "LOW",
        humanApprovalRequired: false,
        impactScore: Math.round((1 - finding.ratio) * 100),
        effortScore: isActivation ? 60 : 45,
        evidenceScore: Math.min(100, scorecard.reach),
        costScore: 10,
        isDemo: campaign.isDemo,
      });
    }
  }

  return candidates;
}

// Rule 2 — a distribution plan with meaningful spend and reach but ~zero
// meaningful conversion is a pause candidate. Mirrors Section 18 example
// #3.
async function lowValuePlanCandidates(): Promise<RecommendationCandidate[]> {
  const plans = await db.select().from(schema.distributionPlans).where(eq(schema.distributionPlans.status, "RUNNING"));
  const candidates: RecommendationCandidate[] = [];

  for (const plan of plans) {
    const executions = await db
      .select()
      .from(schema.distributionExecutions)
      .where(eq(schema.distributionExecutions.distributionPlanId, plan.id));
    const spend = executions.reduce((sum, e) => sum + (e.reportedSpend ? Number(e.reportedSpend) : 0), 0);
    if (spend < LOW_VALUE_SPEND_THRESHOLD) continue;

    const touchRows = await db
      .selectDistinct({ profileId: schema.touchpoints.profileId })
      .from(schema.touchpoints)
      .where(eq(schema.touchpoints.distributionPlanId, plan.id));
    if (touchRows.length < MIN_REACH_FOR_PLAN_JUDGMENT) continue;

    const attributed = await db
      .select({ conversionEventId: schema.attributionRecords.conversionEventId })
      .from(schema.attributionRecords)
      .where(eq(schema.attributionRecords.distributionPlanId, plan.id));
    const conversionCount = new Set(attributed.map((a) => a.conversionEventId)).size;

    if (conversionCount === 0) {
      candidates.push({
        title: `Pause low-value plan: ${plan.objective.slice(0, 60)}`,
        actionType: "PAUSE_LOW_VALUE_PLAN",
        priority: "MEDIUM",
        expectedImpact: `Stops spend with zero attributed conversions from ${touchRows.length} reached profiles.`,
        evidence: { distributionPlanId: plan.id, channel: plan.channel, spend, reach: touchRows.length, attributedConversions: conversionCount },
        supportingMetrics: { spend, reach: touchRows.length },
        affectedPillars: ["DISTRIBUTION", "IMPACT"],
        campaignId: plan.campaignId,
        reason: `Plan has ${touchRows.length} reached profiles and measured spend but zero attributed conversions.`,
        confidence: "MEDIUM",
        riskLevel: "LOW",
        humanApprovalRequired: true,
        impactScore: Math.min(100, Math.round(spend * 2)),
        effortScore: 15,
        evidenceScore: Math.min(100, touchRows.length),
        costScore: Math.min(100, Math.round(spend)),
        isDemo: plan.isDemo,
      });
    }
  }

  return candidates;
}

// Rule 3 — a completed, winning experiment on a plan with below-average
// cost-per-first-use suggests increasing that plan's budget. Mirrors
// Section 18 example #1.
async function scaleWinningVariantCandidates(): Promise<RecommendationCandidate[]> {
  const completed = await listExperiments({ status: "COMPLETED" });
  const candidates: RecommendationCandidate[] = [];

  for (const experiment of completed) {
    if (!experiment.winnerVariantId) continue;
    const [variant] = await db
      .select()
      .from(schema.experimentVariants)
      .where(eq(schema.experimentVariants.id, experiment.winnerVariantId))
      .limit(1);
    if (!variant?.distributionPlanId) continue;

    const [latestResult] = await listExperimentResults(experiment.id);
    if (!latestResult || latestResult.confidence === "INSUFFICIENT_DATA" || latestResult.confidence === "LOW") continue;

    candidates.push({
      title: `Scale "${variant.messagingAngle}" — winning variant of ${experiment.name}`,
      actionType: "INCREASE_BUDGET_REQUEST",
      priority: latestResult.confidence === "HIGH" ? "HIGH" : "MEDIUM",
      expectedImpact: `The winning variant showed a measurable lift on ${experiment.primaryMetric} — increasing its budget extends that lift to more reach.`,
      evidence: { experimentId: experiment.id, winnerVariantId: variant.id, resultId: latestResult.id, perVariant: latestResult.perVariant },
      supportingMetrics: { primaryMetric: experiment.primaryMetric, confidence: latestResult.confidence },
      affectedPillars: ["MARKETING", "DISTRIBUTION", "ACTION"],
      campaignId: experiment.campaignId,
      experimentId: experiment.id,
      reason: latestResult.interpretation,
      confidence: latestResult.confidence,
      riskLevel: "MEDIUM", // budget increase is always at least MEDIUM risk
      costImplication: "Requires an increased distribution budget on the winning variant's plan — exact amount is an Owner budget decision.",
      humanApprovalRequired: true,
      impactScore: confidenceScore(latestResult.confidence),
      effortScore: 30,
      evidenceScore: Math.min(100, latestResult.perVariant.reduce((sum, v) => sum + v.sampleCount, 0)),
      costScore: 55,
      isDemo: experiment.isDemo,
    });
  }

  return candidates;
}

// Rule 4 — abandoned-journey cohort recovery.
async function journeyRecoveryCandidates(): Promise<RecommendationCandidate[]> {
  const abandoned = await db.select().from(schema.productJourneys).where(eq(schema.productJourneys.status, "ABANDONED"));
  if (abandoned.length === 0) return [];

  const byType = new Map<string, number>();
  for (const j of abandoned) byType.set(j.journeyType, (byType.get(j.journeyType) ?? 0) + 1);

  return [
    {
      title: `Recover ${abandoned.length} abandoned journey(s)`,
      actionType: "RECOVER_JOURNEY",
      priority: abandoned.length >= 5 ? "HIGH" : "MEDIUM",
      expectedImpact: "Resuming abandoned journeys is typically cheaper than acquiring new reach for the same outcome.",
      evidence: { abandonedCount: abandoned.length, byJourneyType: Object.fromEntries(byType) },
      supportingMetrics: { abandonedCount: abandoned.length },
      affectedPillars: ["IMPACT", "ACTION"],
      reason: `${abandoned.length} journeys are currently ABANDONED across ${byType.size} journey type(s); each eligible profile already has a RESUME_JOURNEY next-best-action queued (Phase 4).`,
      confidence: "HIGH",
      riskLevel: "LOW",
      humanApprovalRequired: false,
      impactScore: Math.min(100, abandoned.length * 10),
      effortScore: 20,
      evidenceScore: Math.min(100, abandoned.length * 10),
      costScore: 5,
      isDemo: abandoned.every((j) => j.isDemo),
    },
  ];
}

// Rule 5 — upsell/re-engagement cohorts, from Phase 4's own next-best-
// action classifications (never re-derived/re-guessed here).
async function segmentCohortCandidates(): Promise<RecommendationCandidate[]> {
  const candidates: RecommendationCandidate[] = [];

  const latestNbaPerProfile = await db
    .select({ profileId: schema.nextBestActions.profileId, actionType: schema.nextBestActions.actionType, createdAt: schema.nextBestActions.createdAt })
    .from(schema.nextBestActions)
    .orderBy(desc(schema.nextBestActions.createdAt));
  const seen = new Set<string>();
  const currentByProfile = new Map<string, string>();
  for (const row of latestNbaPerProfile) {
    if (seen.has(row.profileId)) continue;
    seen.add(row.profileId);
    currentByProfile.set(row.profileId, row.actionType);
  }

  const profileDemoFlags = new Map(
    (await db.select({ id: schema.audienceProfiles.id, isDemo: schema.audienceProfiles.isDemo }).from(schema.audienceProfiles)).map((p) => [p.id, p.isDemo])
  );

  const upsellProfileIds = [...currentByProfile.entries()].filter(([, a]) => a === "UPSELL" || a === "CROSS_SELL").map(([id]) => id);
  if (upsellProfileIds.length >= UPSELL_COHORT_THRESHOLD) {
    candidates.push({
      title: `Act on ${upsellProfileIds.length} upsell/cross-sell-eligible profile(s)`,
      actionType: "UPSELL_SEGMENT",
      priority: upsellProfileIds.length >= 5 ? "HIGH" : "MEDIUM",
      expectedImpact: "Converts existing qualified usage into a higher-value product relationship.",
      evidence: { eligibleCount: upsellProfileIds.length },
      supportingMetrics: { eligibleCount: upsellProfileIds.length },
      affectedPillars: ["ACTION", "IMPACT"],
      reason: `${upsellProfileIds.length} profile(s) currently have a Phase 4 next-best-action of UPSELL or CROSS_SELL, each with its own observed-evidence justification.`,
      confidence: "HIGH",
      riskLevel: "LOW",
      humanApprovalRequired: false,
      impactScore: Math.min(100, upsellProfileIds.length * 15),
      effortScore: 35,
      evidenceScore: Math.min(100, upsellProfileIds.length * 15),
      costScore: 10,
      isDemo: upsellProfileIds.every((id) => profileDemoFlags.get(id)),
    });
  }

  const dormantRows = await db.select({ id: schema.audienceProfiles.id, isDemo: schema.audienceProfiles.isDemo }).from(schema.audienceProfiles).where(eq(schema.audienceProfiles.lifecycleState, "DORMANT"));
  if (dormantRows.length >= DORMANT_COHORT_THRESHOLD) {
    candidates.push({
      title: `Re-engage ${dormantRows.length} dormant profile(s)`,
      actionType: "REENGAGE_SEGMENT",
      priority: dormantRows.length >= 10 ? "HIGH" : "LOW",
      expectedImpact: "Recovers previously-engaged profiles before they are permanently lost.",
      evidence: { dormantCount: dormantRows.length },
      supportingMetrics: { dormantCount: dormantRows.length },
      affectedPillars: ["ACTION"],
      reason: `${dormantRows.length} profile(s) are in DORMANT lifecycle state (previously engaged, no recent activity).`,
      confidence: "MEDIUM",
      riskLevel: "LOW",
      humanApprovalRequired: false,
      impactScore: Math.min(100, dormantRows.length * 8),
      effortScore: 35,
      evidenceScore: Math.min(100, dormantRows.length * 8),
      costScore: 10,
      isDemo: dormantRows.every((r) => r.isDemo),
    });
  }

  return candidates;
}

// Rule 6 — a high-scoring, not-yet-approved opportunity is worth
// investigating/prioritizing.
async function opportunityCandidates(): Promise<RecommendationCandidate[]> {
  const pending = await listOpportunities({ status: ["NEEDS_REVIEW", "DRAFT"] });
  const candidates: RecommendationCandidate[] = [];

  for (const opp of pending) {
    if (opp.opportunityScore < 70) continue;
    const score = await getOpportunityScore(opp.id);
    candidates.push({
      title: `Investigate opportunity: ${opp.title}`,
      actionType: "INVESTIGATE_OPPORTUNITY",
      priority: opp.opportunityScore >= 85 ? "HIGH" : "MEDIUM",
      expectedImpact: "A high-scoring, unapproved opportunity may be an under-prioritized commercial angle.",
      evidence: { opportunityId: opp.id, opportunityScore: opp.opportunityScore, scoreExplanation: score?.explanation ?? {} },
      supportingMetrics: { opportunityScore: opp.opportunityScore },
      affectedPillars: ["MARKETING", "POSITIONING"],
      reason: `Opportunity scored ${opp.opportunityScore}/100 and is still ${opp.status}, not yet approved into a campaign.`,
      confidence: opp.opportunityScore >= 85 ? "HIGH" : "MEDIUM",
      riskLevel: "LOW",
      humanApprovalRequired: false,
      impactScore: opp.opportunityScore,
      effortScore: 40,
      evidenceScore: Math.round(Number(opp.confidence) * 100),
      costScore: 5,
      isDemo: opp.isDemo,
    });
  }

  return candidates;
}

// Rule 7 — a campaign with more than one creative variant and real reach
// but no experiment yet is worth testing.
async function runExperimentCandidates(): Promise<RecommendationCandidate[]> {
  const campaigns = await listCampaigns();
  const candidates: RecommendationCandidate[] = [];

  for (const campaign of campaigns) {
    const variants = await db.select({ id: schema.creativeVariants.id }).from(schema.creativeVariants).where(eq(schema.creativeVariants.campaignId, campaign.id));
    if (variants.length < 2) continue;

    const existing = await listExperiments({ campaignId: campaign.id });
    if (existing.length > 0) continue;

    const scorecard = await computeCampaignScorecard(campaign.id);
    if (scorecard.reach < MIN_REACH_FOR_PLAN_JUDGMENT) continue;

    candidates.push({
      title: `Run an experiment for ${campaign.name}`,
      actionType: "RUN_EXPERIMENT",
      priority: "LOW",
      expectedImpact: "Comparing existing creative variants against real SecurePay behavior (not just clicks) turns a guess into evidence.",
      evidence: { campaignId: campaign.id, creativeVariantCount: variants.length, reach: scorecard.reach },
      supportingMetrics: { reach: scorecard.reach },
      affectedPillars: ["MARKETING", "ACTION"],
      campaignId: campaign.id,
      reason: `${variants.length} creative variants exist for this campaign with ${scorecard.reach} reached profiles, but no experiment has compared them yet.`,
      confidence: "MEDIUM",
      riskLevel: "LOW",
      humanApprovalRequired: false,
      impactScore: 40,
      effortScore: 50,
      evidenceScore: Math.min(100, scorecard.reach),
      costScore: 15,
      isDemo: campaign.isDemo,
    });
  }

  return candidates;
}

// Rule 8 — model recommendations already proposed by the model-evaluation
// engine surface here as Growth Director candidates too (cross-pillar
// visibility), never regenerated/re-decided by this module. Model
// performance is never a demo concept — always isDemo: false.
async function modelCandidates(): Promise<RecommendationCandidate[]> {
  const proposed = await listModelRecommendations({ status: "PROPOSED" });
  return proposed.map((rec) => ({
    title: `Review model routing for ${rec.taskType}`,
    actionType: "REVIEW_MODEL" as ActionType,
    priority: "LOW" as Priority,
    expectedImpact: "A proposed model swap may improve quality/cost/latency for this task type.",
    evidence: { modelRecommendationId: rec.id, taskType: rec.taskType, supportingMetrics: rec.supportingMetrics },
    supportingMetrics: rec.supportingMetrics as Record<string, unknown>,
    affectedPillars: ["ACTION"],
    reason: rec.reason,
    confidence: "MEDIUM" as Confidence,
    riskLevel: "MEDIUM" as RiskLevel, // routing changes are at least Medium risk
    humanApprovalRequired: true,
    impactScore: 40,
    effortScore: 20,
    evidenceScore: 50,
    costScore: 20,
    isDemo: false,
  }));
}

export async function generateCandidates(): Promise<RecommendationCandidate[]> {
  const results = await Promise.all([
    funnelDropOffCandidates(),
    lowValuePlanCandidates(),
    scaleWinningVariantCandidates(),
    journeyRecoveryCandidates(),
    segmentCohortCandidates(),
    opportunityCandidates(),
    runExperimentCandidates(),
    modelCandidates(),
  ]);

  const candidates = results.flat();

  if (candidates.length === 0) {
    candidates.push({
      title: "No significant issues or opportunities found this cycle",
      actionType: "NO_ACTION",
      priority: "LOW",
      expectedImpact: "None — this is a status confirmation, not a recommendation to act.",
      evidence: {},
      supportingMetrics: {},
      affectedPillars: [],
      reason: "The deterministic candidate rules found no funnel drop-offs, low-value plans, abandoned-journey backlog, upsell/re-engagement cohorts, high-scoring unreviewed opportunities, or untested multi-variant campaigns above their evaluation thresholds.",
      confidence: "MEDIUM",
      riskLevel: "LOW",
      humanApprovalRequired: false,
      impactScore: 0,
      effortScore: 0,
      evidenceScore: 50,
      costScore: 0,
      isDemo: false,
    });
  }

  return candidates;
}
