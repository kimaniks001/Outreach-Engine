import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Conversion funnel views + deterministic drop-off diagnostics — Phase 4
// brief Sections 25/26. Funnel membership is profile-set based (did this
// profile reach this stage at all), not strict last/first attribution —
// attribution weighting lives in src/lib/attribution/engine.ts and answers
// a different question ("how much credit does each touch get"). Not every
// campaign/channel needs every stage populated.
//
// Production readiness review: excludes isDemo rows by default so demo/
// seed activity never blends into a production funnel/impact figure. Pass
// `{ includeDemo: true }` to include it (e.g. the local-dev demo walkthrough).

export interface FunnelOptions {
  includeDemo?: boolean;
}

export const FUNNEL_STAGES = [
  "REACH",
  "VISIT",
  "ENGAGEMENT",
  "DEMO",
  "KSNUMBER",
  "PRODUCT_STARTED",
  "PRODUCT_CREATED",
  "PAYMENT",
  "AGREEMENT_COMPLETED",
  "SETTLEMENT",
  "REPEAT",
  "REFERRAL",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface FunnelSummary {
  campaignId: string | null;
  stages: Array<{ stage: FunnelStage; profileCount: number }>;
}

const ENGAGEMENT_TOUCH_TYPES = ["AD_CLICK", "LANDING_PAGE_VIEW", "DEMO_STARTED", "DEMO_COMPLETED", "FORM_SUBMITTED", "REPLY_RECEIVED"] as const;

type TouchpointType = (typeof schema.touchpointTypeEnum.enumValues)[number];
type ConversionType = (typeof schema.conversionTypeEnum.enumValues)[number];

async function touchpointProfileIds(
  types: readonly TouchpointType[],
  campaignId?: string,
  includeDemo = false
): Promise<Set<string>> {
  const conditions = [inArray(schema.touchpoints.type, types as TouchpointType[])];
  if (campaignId) conditions.push(eq(schema.touchpoints.campaignId, campaignId));
  if (!includeDemo) conditions.push(eq(schema.touchpoints.isDemo, false));
  const rows = await db
    .selectDistinct({ profileId: schema.touchpoints.profileId })
    .from(schema.touchpoints)
    .where(and(...conditions));
  return new Set(rows.map((r) => r.profileId));
}

async function conversionProfileIds(types: readonly ConversionType[], includeDemo = false): Promise<Set<string>> {
  const conditions = [inArray(schema.conversionEvents.conversionType, types as ConversionType[])];
  if (!includeDemo) conditions.push(eq(schema.conversionEvents.isDemo, false));
  const rows = await db
    .selectDistinct({ profileId: schema.conversionEvents.profileId })
    .from(schema.conversionEvents)
    .where(and(...conditions));
  return new Set(rows.map((r) => r.profileId));
}

function intersectIfFiltered(set: Set<string>, reached: Set<string>, campaignId?: string): number {
  if (!campaignId) return set.size;
  let count = 0;
  for (const id of set) if (reached.has(id)) count++;
  return count;
}

export async function computeFunnelSummary(campaignId?: string, options: FunnelOptions = {}): Promise<FunnelSummary> {
  const includeDemo = options.includeDemo ?? false;
  const reached = await touchpointProfileIds(
    ["AD_IMPRESSION", "AD_CLICK", "LANDING_PAGE_VIEW", "OUTREACH_PLANNED", "OUTREACH_SENT"],
    campaignId,
    includeDemo
  );
  const visited = await touchpointProfileIds(["LANDING_PAGE_VIEW"], campaignId, includeDemo);
  const engaged = await touchpointProfileIds(ENGAGEMENT_TOUCH_TYPES, campaignId, includeDemo);
  const demoed = await touchpointProfileIds(["DEMO_STARTED", "DEMO_COMPLETED"], campaignId, includeDemo);
  const productStarted = await touchpointProfileIds(["SECURELINK_STARTED"], campaignId, includeDemo);

  const ksNumber = await conversionProfileIds(["KSNUMBER_CREATED"], includeDemo);
  const productCreated = await conversionProfileIds(
    ["FIRST_SECURELINK", "FIRST_KEYCONTRACT", "FIRST_GROUP_SECURELINK", "FIRST_SECUREFLOW"],
    includeDemo
  );
  const payment = await conversionProfileIds(["PAYMENT_COMMITTED"], includeDemo);
  const agreement = await conversionProfileIds(["AGREEMENT_COMPLETED"], includeDemo);
  const settlement = await conversionProfileIds(["SETTLEMENT_COMPLETED"], includeDemo);
  const repeat = await conversionProfileIds(["REPEAT_USE"], includeDemo);
  const referral = await conversionProfileIds(["REFERRAL"], includeDemo);

  return {
    campaignId: campaignId ?? null,
    stages: [
      { stage: "REACH", profileCount: reached.size },
      { stage: "VISIT", profileCount: visited.size },
      { stage: "ENGAGEMENT", profileCount: engaged.size },
      { stage: "DEMO", profileCount: demoed.size },
      { stage: "KSNUMBER", profileCount: intersectIfFiltered(ksNumber, reached, campaignId) },
      { stage: "PRODUCT_STARTED", profileCount: productStarted.size },
      { stage: "PRODUCT_CREATED", profileCount: intersectIfFiltered(productCreated, reached, campaignId) },
      { stage: "PAYMENT", profileCount: intersectIfFiltered(payment, reached, campaignId) },
      { stage: "AGREEMENT_COMPLETED", profileCount: intersectIfFiltered(agreement, reached, campaignId) },
      { stage: "SETTLEMENT", profileCount: intersectIfFiltered(settlement, reached, campaignId) },
      { stage: "REPEAT", profileCount: intersectIfFiltered(repeat, reached, campaignId) },
      { stage: "REFERRAL", profileCount: intersectIfFiltered(referral, reached, campaignId) },
    ],
  };
}

export interface DropOffFinding {
  fromStage: FunnelStage;
  toStage: FunnelStage;
  ratio: number;
  finding: string;
}

const MIN_SAMPLE = 5;
const LOW_CONVERSION_RATIO = 0.3;

// Deterministic diagnostic findings only — Section 26 explicitly stops
// short of Growth Director recommendations. No ML, no vague "AI thinks
// targeting is off" — every finding cites the exact ratio and stage pair.
export function computeDropOffFindings(summary: FunnelSummary): DropOffFinding[] {
  const byStage = new Map(summary.stages.map((s) => [s.stage, s.profileCount]));
  const findings: DropOffFinding[] = [];

  const pairs: Array<{ from: FunnelStage; to: FunnelStage; label: string }> = [
    { from: "REACH", to: "VISIT", label: "High reach with low visit rate suggests a creative or targeting issue." },
    {
      from: "KSNUMBER",
      to: "PRODUCT_CREATED",
      label: "High KSNumber creation with low first-product creation suggests an onboarding/product-activation issue.",
    },
    {
      from: "PRODUCT_STARTED",
      to: "PRODUCT_CREATED",
      label: "High product-start with low completion suggests journey friction.",
    },
  ];

  for (const pair of pairs) {
    const from = byStage.get(pair.from) ?? 0;
    const to = byStage.get(pair.to) ?? 0;
    if (from < MIN_SAMPLE) continue; // too small a sample to diagnose reliably
    const ratio = to / from;
    if (ratio < LOW_CONVERSION_RATIO) {
      findings.push({
        fromStage: pair.from,
        toStage: pair.to,
        ratio: Math.round(ratio * 1000) / 1000,
        finding: `${pair.label} (${to}/${from} = ${(ratio * 100).toFixed(1)}%, below the ${(
          LOW_CONVERSION_RATIO * 100
        ).toFixed(0)}% threshold.)`,
      });
    }
  }

  return findings;
}

export interface ImpactSummary {
  reachedProfiles: number;
  engagedProfiles: number;
  ksNumbersCreated: number;
  firstProductUses: number;
  completedAgreements: number;
  repeatUsers: number;
  conversionsByCampaign: Array<{ campaignId: string; conversionCount: number }>;
  conversionsByChannel: Array<{ channel: string; conversionCount: number }>;
}

// KSNUMBER_CREATED is its own separate stat (ksNumbersCreated) — Section
// 30 lists "KSNumbers created" and "first product uses" separately.
const FIRST_USE_CONVERSION_TYPES = [
  "FIRST_SECURELINK",
  "FIRST_KEYCONTRACT",
  "FIRST_GROUP_SECURELINK",
  "FIRST_SECUREFLOW",
] as const;

// Real Phase 4 counts only — Section 30. No fabricated revenue: this
// function never invents a monetary figure.
export async function computeImpactSummary(options: FunnelOptions = {}): Promise<ImpactSummary> {
  const includeDemo = options.includeDemo ?? false;
  const demoConversionCondition = includeDemo ? [] : [eq(schema.conversionEvents.isDemo, false)];
  const demoAttributionCondition = includeDemo ? [] : [eq(schema.conversionEvents.isDemo, false)];

  const reached = await touchpointProfileIds(
    ["AD_IMPRESSION", "AD_CLICK", "LANDING_PAGE_VIEW", "OUTREACH_PLANNED", "OUTREACH_SENT"],
    undefined,
    includeDemo
  );
  const engaged = await touchpointProfileIds(ENGAGEMENT_TOUCH_TYPES, undefined, includeDemo);

  const [ksNumberRows, firstUseRows, agreementRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.conversionEvents)
      .where(and(eq(schema.conversionEvents.conversionType, "KSNUMBER_CREATED"), ...demoConversionCondition)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.conversionEvents)
      .where(and(inArray(schema.conversionEvents.conversionType, [...FIRST_USE_CONVERSION_TYPES]), ...demoConversionCondition)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.conversionEvents)
      .where(and(eq(schema.conversionEvents.conversionType, "AGREEMENT_COMPLETED"), ...demoConversionCondition)),
  ]);

  const repeatUserIds = await conversionProfileIds(["REPEAT_USE"], includeDemo);

  const byCampaign = await db
    .select({ campaignId: schema.attributionRecords.campaignId, count: sql<number>`count(distinct ${schema.attributionRecords.conversionEventId})::int` })
    .from(schema.attributionRecords)
    .innerJoin(schema.conversionEvents, eq(schema.attributionRecords.conversionEventId, schema.conversionEvents.id))
    .where(and(eq(schema.attributionRecords.attributionModel, "LAST_TOUCH"), ...demoAttributionCondition))
    .groupBy(schema.attributionRecords.campaignId);

  const byChannel = await db
    .select({ channel: schema.attributionRecords.channel, count: sql<number>`count(distinct ${schema.attributionRecords.conversionEventId})::int` })
    .from(schema.attributionRecords)
    .innerJoin(schema.conversionEvents, eq(schema.attributionRecords.conversionEventId, schema.conversionEvents.id))
    .where(and(eq(schema.attributionRecords.attributionModel, "LAST_TOUCH"), ...demoAttributionCondition))
    .groupBy(schema.attributionRecords.channel);

  return {
    reachedProfiles: reached.size,
    engagedProfiles: engaged.size,
    ksNumbersCreated: ksNumberRows[0]?.count ?? 0,
    firstProductUses: firstUseRows[0]?.count ?? 0,
    completedAgreements: agreementRows[0]?.count ?? 0,
    repeatUsers: repeatUserIds.size,
    conversionsByCampaign: byCampaign
      .filter((r) => r.campaignId !== null)
      .map((r) => ({ campaignId: r.campaignId as string, conversionCount: r.count })),
    conversionsByChannel: byChannel
      .filter((r) => r.channel !== null)
      .map((r) => ({ channel: r.channel as string, conversionCount: r.count })),
  };
}
