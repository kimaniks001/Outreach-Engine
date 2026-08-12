import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { computeFunnelSummary, computeDropOffFindings } from "@/lib/attribution/funnel";

// Impact scorecards — Phase 5 brief Section 8. Every figure here is a
// direct aggregation of real Phase 1-4 records (touchpoints, conversions,
// attribution, distribution executions). Nothing is fabricated; a metric
// with no underlying data is 0 or null, never invented.
//
// Production readiness review: every function here excludes isDemo rows by
// default (`includeDemo: false`) so demo/seed data can never blend into a
// production Impact/Analytics figure. Callers that explicitly want demo
// data included (e.g. the local-dev seed walkthrough) must opt in with
// `{ includeDemo: true }`. See docs/PRODUCTION_READINESS_REVIEW.md.

export interface ScorecardOptions {
  includeDemo?: boolean;
}

const ENGAGEMENT_TOUCH_TYPES = [
  "AD_CLICK",
  "LANDING_PAGE_VIEW",
  "DEMO_STARTED",
  "DEMO_COMPLETED",
  "FORM_SUBMITTED",
  "REPLY_RECEIVED",
] as const;

const PRODUCT_TOUCH_TYPES = {
  SECURELINK: "SECURELINK_CREATED",
  KEYCONTRACT: "KEYCONTRACT_CREATED",
  GROUP_SECURELINK: "GROUP_SECURELINK_CREATED",
  SECUREFLOW: "SECUREFLOW_CREATED",
} as const;

async function distinctProfileCount(
  conditions: Parameters<typeof and>[0][]
): Promise<number> {
  const rows = await db
    .selectDistinct({ profileId: schema.touchpoints.profileId })
    .from(schema.touchpoints)
    .where(and(...conditions));
  return rows.length;
}

async function planIdsForCampaign(campaignId: string, includeDemo: boolean): Promise<string[]> {
  const conditions = [eq(schema.distributionPlans.campaignId, campaignId)];
  if (!includeDemo) conditions.push(eq(schema.distributionPlans.isDemo, false));
  const rows = await db
    .select({ id: schema.distributionPlans.id })
    .from(schema.distributionPlans)
    .where(and(...conditions));
  return rows.map((r) => r.id);
}

export interface CampaignScorecard {
  campaignId: string;
  reach: number;
  engagement: number;
  registrations: number;
  firstUse: number;
  agreementCompletion: number;
  repeatUse: number;
  attributedConversions: number;
  spend: number | null;
  costPerConversion: number | null;
  funnel: Awaited<ReturnType<typeof computeFunnelSummary>>;
  dropOffFindings: ReturnType<typeof computeDropOffFindings>;
}

export async function computeCampaignScorecard(campaignId: string, options: ScorecardOptions = {}): Promise<CampaignScorecard> {
  const includeDemo = options.includeDemo ?? false;
  const touchpointDemoCondition = includeDemo ? [] : [eq(schema.touchpoints.isDemo, false)];

  const reach = await distinctProfileCount([eq(schema.touchpoints.campaignId, campaignId), ...touchpointDemoCondition]);
  const engagement = await distinctProfileCount([
    eq(schema.touchpoints.campaignId, campaignId),
    inArray(schema.touchpoints.type, [...ENGAGEMENT_TOUCH_TYPES]),
    ...touchpointDemoCondition,
  ]);

  const attributionRows = await db
    .select({ conversionEventId: schema.attributionRecords.conversionEventId })
    .from(schema.attributionRecords)
    .innerJoin(schema.conversionEvents, eq(schema.attributionRecords.conversionEventId, schema.conversionEvents.id))
    .where(
      and(
        eq(schema.attributionRecords.campaignId, campaignId),
        eq(schema.attributionRecords.attributionModel, "LINEAR"),
        ...(includeDemo ? [] : [eq(schema.conversionEvents.isDemo, false)])
      )
    );
  const attributedConversionIds = [...new Set(attributionRows.map((r) => r.conversionEventId))];

  let registrations = 0;
  let firstUse = 0;
  let agreementCompletion = 0;
  let repeatUse = 0;
  if (attributedConversionIds.length > 0) {
    const conversions = await db
      .select({ conversionType: schema.conversionEvents.conversionType })
      .from(schema.conversionEvents)
      .where(inArray(schema.conversionEvents.id, attributedConversionIds));
    for (const c of conversions) {
      if (c.conversionType === "KSNUMBER_CREATED") registrations++;
      if (["FIRST_SECURELINK", "FIRST_KEYCONTRACT", "FIRST_GROUP_SECURELINK", "FIRST_SECUREFLOW"].includes(c.conversionType))
        firstUse++;
      if (c.conversionType === "AGREEMENT_COMPLETED") agreementCompletion++;
      if (c.conversionType === "REPEAT_USE") repeatUse++;
    }
  }

  const planIds = await planIdsForCampaign(campaignId, includeDemo);
  let spend: number | null = null;
  if (planIds.length > 0) {
    const spendRows = await db
      .select({ total: sql<string | null>`sum(${schema.distributionExecutions.reportedSpend})` })
      .from(schema.distributionExecutions)
      .where(inArray(schema.distributionExecutions.distributionPlanId, planIds));
    spend = spendRows[0]?.total !== null && spendRows[0]?.total !== undefined ? Number(spendRows[0].total) : null;
  }

  const funnel = await computeFunnelSummary(campaignId, options);
  const dropOffFindings = computeDropOffFindings(funnel);

  return {
    campaignId,
    reach,
    engagement,
    registrations,
    firstUse,
    agreementCompletion,
    repeatUse,
    attributedConversions: attributedConversionIds.length,
    spend,
    costPerConversion: spend !== null && attributedConversionIds.length > 0 ? round2(spend / attributedConversionIds.length) : null,
    funnel,
    dropOffFindings,
  };
}

export interface ChannelScorecard {
  channel: string;
  reach: number;
  meaningfulConversions: number;
  spend: number | null;
  conversionRate: number | null;
  touchModelContribution: { firstTouch: number; lastTouch: number; linear: number; multiTouch: number };
}

export async function computeChannelScorecard(
  channel: (typeof schema.channelTypeEnum.enumValues)[number],
  options: ScorecardOptions = {}
): Promise<ChannelScorecard> {
  const includeDemo = options.includeDemo ?? false;

  const reach = await distinctProfileCount([
    eq(schema.touchpoints.channel, channel),
    ...(includeDemo ? [] : [eq(schema.touchpoints.isDemo, false)]),
  ]);

  const attributionRows = await db
    .select({ attributionModel: schema.attributionRecords.attributionModel, conversionEventId: schema.attributionRecords.conversionEventId })
    .from(schema.attributionRecords)
    .innerJoin(schema.conversionEvents, eq(schema.attributionRecords.conversionEventId, schema.conversionEvents.id))
    .where(
      and(
        eq(schema.attributionRecords.channel, channel),
        ...(includeDemo ? [] : [eq(schema.conversionEvents.isDemo, false)])
      )
    );

  const byModel = { firstTouch: 0, lastTouch: 0, linear: 0, multiTouch: 0 };
  const linearConversionIds = new Set<string>();
  for (const r of attributionRows) {
    if (r.attributionModel === "FIRST_TOUCH") byModel.firstTouch++;
    if (r.attributionModel === "LAST_TOUCH") byModel.lastTouch++;
    if (r.attributionModel === "LINEAR") {
      byModel.linear++;
      linearConversionIds.add(r.conversionEventId);
    }
    if (r.attributionModel === "MULTI_TOUCH") byModel.multiTouch++;
  }

  const executionRows = await db
    .select({ total: sql<string | null>`sum(${schema.distributionExecutions.reportedSpend})` })
    .from(schema.distributionExecutions)
    .innerJoin(schema.distributionPlans, eq(schema.distributionExecutions.distributionPlanId, schema.distributionPlans.id))
    .where(
      and(
        eq(schema.distributionExecutions.channel, channel),
        ...(includeDemo ? [] : [eq(schema.distributionPlans.isDemo, false)])
      )
    );
  const spend = executionRows[0]?.total !== null && executionRows[0]?.total !== undefined ? Number(executionRows[0].total) : null;

  return {
    channel,
    reach,
    meaningfulConversions: linearConversionIds.size,
    spend,
    conversionRate: reach > 0 ? round4(linearConversionIds.size / reach) : null,
    touchModelContribution: byModel,
  };
}

export interface ProductScorecard {
  product: string;
  adoption: number; // distinct profiles that created this product at least once
  repeatUsers: number; // distinct profiles with a REPEAT_USE conversion after this product's first-use conversion type
}

export async function computeProductScorecards(options: ScorecardOptions = {}): Promise<ProductScorecard[]> {
  const includeDemo = options.includeDemo ?? false;
  const results: ProductScorecard[] = [];
  for (const [label, touchType] of Object.entries(PRODUCT_TOUCH_TYPES)) {
    const adoption = await distinctProfileCount([
      eq(schema.touchpoints.type, touchType),
      ...(includeDemo ? [] : [eq(schema.touchpoints.isDemo, false)]),
    ]);
    results.push({ product: label, adoption, repeatUsers: 0 });
  }

  const repeatRows = await db
    .selectDistinct({ profileId: schema.conversionEvents.profileId })
    .from(schema.conversionEvents)
    .where(
      and(
        eq(schema.conversionEvents.conversionType, "REPEAT_USE"),
        ...(includeDemo ? [] : [eq(schema.conversionEvents.isDemo, false)])
      )
    );
  const repeatCount = repeatRows.length;
  // Repeat use isn't tracked per-product in this schema (PRODUCT_REUSED/
  // REPEAT_USE are product-agnostic signals) — reported once as an overall
  // figure rather than fabricating a per-product split with no evidence.
  return results.map((r) => ({ ...r, repeatUsers: repeatCount }));
}

export interface AudienceScorecard {
  audienceSegmentId: string;
  engagement: number;
  conversions: number;
  lifecycleDistribution: Record<string, number>;
}

export async function computeAudienceScorecard(audienceSegmentId: string, options: ScorecardOptions = {}): Promise<AudienceScorecard> {
  const includeDemo = options.includeDemo ?? false;

  const planConditions = [eq(schema.distributionPlans.audienceSegmentId, audienceSegmentId)];
  if (!includeDemo) planConditions.push(eq(schema.distributionPlans.isDemo, false));
  const planRows = await db
    .select({ id: schema.distributionPlans.id })
    .from(schema.distributionPlans)
    .where(and(...planConditions));
  const planIds = planRows.map((r) => r.id);

  if (planIds.length === 0) {
    return { audienceSegmentId, engagement: 0, conversions: 0, lifecycleDistribution: {} };
  }

  const touchConditions = [inArray(schema.touchpoints.distributionPlanId, planIds), inArray(schema.touchpoints.type, [...ENGAGEMENT_TOUCH_TYPES])];
  if (!includeDemo) touchConditions.push(eq(schema.touchpoints.isDemo, false));
  const touchRows = await db
    .selectDistinct({ profileId: schema.touchpoints.profileId })
    .from(schema.touchpoints)
    .where(and(...touchConditions));
  const profileIds = touchRows.map((r) => r.profileId);

  if (profileIds.length === 0) {
    return { audienceSegmentId, engagement: 0, conversions: 0, lifecycleDistribution: {} };
  }

  const conversionConditions = [inArray(schema.conversionEvents.profileId, profileIds)];
  if (!includeDemo) conversionConditions.push(eq(schema.conversionEvents.isDemo, false));
  const conversions = await db
    .select({ id: schema.conversionEvents.id })
    .from(schema.conversionEvents)
    .where(and(...conversionConditions));

  const profiles = await db
    .select({ lifecycleState: schema.audienceProfiles.lifecycleState })
    .from(schema.audienceProfiles)
    .where(inArray(schema.audienceProfiles.id, profileIds));

  const lifecycleDistribution: Record<string, number> = {};
  for (const p of profiles) {
    lifecycleDistribution[p.lifecycleState] = (lifecycleDistribution[p.lifecycleState] ?? 0) + 1;
  }

  return {
    audienceSegmentId,
    engagement: profileIds.length,
    conversions: conversions.length,
    lifecycleDistribution,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
