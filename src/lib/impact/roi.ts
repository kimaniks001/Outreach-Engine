import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Practical efficiency model — Phase 5 brief Section 9. Never fabricates a
// monetary value: cost-per-outcome divides real measured cost by real
// measured outcome counts; ROI is computed only when real
// conversion_events.value data exists, otherwise the system says so
// explicitly rather than guessing.

const ENGAGEMENT_TOUCH_TYPES = [
  "AD_CLICK",
  "LANDING_PAGE_VIEW",
  "DEMO_STARTED",
  "DEMO_COMPLETED",
  "FORM_SUBMITTED",
  "REPLY_RECEIVED",
] as const;

export interface EfficiencySummary {
  distributionSpend: number | null;
  aiCost: number | null;
  totalMeasuredCost: number | null;
  engagedProfiles: number;
  ksNumbersCreated: number;
  firstProductUses: number;
  completedAgreements: number;
  repeatUsers: number;
  costPerEngagedProfile: number | null;
  costPerKsNumber: number | null;
  costPerFirstProductUse: number | null;
  costPerCompletedAgreement: number | null;
  costPerRepeatUser: number | null;
}

function safeDivide(cost: number | null, count: number): number | null {
  if (cost === null || count <= 0) return null;
  return Math.round((cost / count) * 100) / 100;
}

export async function computeEfficiencySummary(): Promise<EfficiencySummary> {
  const [distributionSpendRows, aiCostRows] = await Promise.all([
    db.select({ total: sql<string | null>`sum(${schema.distributionExecutions.reportedSpend})` }).from(schema.distributionExecutions),
    db.select({ total: sql<string | null>`sum(${schema.aiUsageRecords.estimatedCostUsd})` }).from(schema.aiUsageRecords),
  ]);

  const distributionSpend = distributionSpendRows[0]?.total != null ? Number(distributionSpendRows[0].total) : null;
  const aiCost = aiCostRows[0]?.total != null ? Number(aiCostRows[0].total) : null;
  const totalMeasuredCost = distributionSpend !== null || aiCost !== null ? (distributionSpend ?? 0) + (aiCost ?? 0) : null;

  const engagedRows = await db
    .selectDistinct({ profileId: schema.touchpoints.profileId })
    .from(schema.touchpoints)
    .where(inArray(schema.touchpoints.type, [...ENGAGEMENT_TOUCH_TYPES]));

  const [ksNumberRows, firstUseRows, agreementRows, repeatRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(schema.conversionEvents).where(eq(schema.conversionEvents.conversionType, "KSNUMBER_CREATED")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.conversionEvents)
      .where(inArray(schema.conversionEvents.conversionType, ["FIRST_SECURELINK", "FIRST_KEYCONTRACT", "FIRST_GROUP_SECURELINK", "FIRST_SECUREFLOW"])),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.conversionEvents).where(eq(schema.conversionEvents.conversionType, "AGREEMENT_COMPLETED")),
    db.selectDistinct({ profileId: schema.conversionEvents.profileId }).from(schema.conversionEvents).where(eq(schema.conversionEvents.conversionType, "REPEAT_USE")),
  ]);

  const engagedProfiles = engagedRows.length;
  const ksNumbersCreated = ksNumberRows[0]?.count ?? 0;
  const firstProductUses = firstUseRows[0]?.count ?? 0;
  const completedAgreements = agreementRows[0]?.count ?? 0;
  const repeatUsers = repeatRows.length;

  return {
    distributionSpend,
    aiCost,
    totalMeasuredCost,
    engagedProfiles,
    ksNumbersCreated,
    firstProductUses,
    completedAgreements,
    repeatUsers,
    costPerEngagedProfile: safeDivide(totalMeasuredCost, engagedProfiles),
    costPerKsNumber: safeDivide(totalMeasuredCost, ksNumbersCreated),
    costPerFirstProductUse: safeDivide(totalMeasuredCost, firstProductUses),
    costPerCompletedAgreement: safeDivide(totalMeasuredCost, completedAgreements),
    costPerRepeatUser: safeDivide(totalMeasuredCost, repeatUsers),
  };
}

export type RoiResult =
  | { status: "INSUFFICIENT_VALUE_DATA" }
  | { status: "COMPUTED"; totalValue: number; totalCost: number; roi: number; conversionsWithValue: number };

// Never fabricated: only computed when at least one conversion_events.value
// is actually known. See Phase 5 brief Section 9.
export async function computeRoi(): Promise<RoiResult> {
  const valueRows = await db
    .select({ value: schema.conversionEvents.value })
    .from(schema.conversionEvents)
    .where(isNotNull(schema.conversionEvents.value));

  if (valueRows.length === 0) {
    return { status: "INSUFFICIENT_VALUE_DATA" };
  }

  const totalValue = valueRows.reduce((sum, r) => sum + Number(r.value), 0);
  const efficiency = await computeEfficiencySummary();
  const totalCost = efficiency.totalMeasuredCost ?? 0;

  // Zero measured cost makes ROI mathematically undefined (division by
  // zero) — reported as insufficient data rather than a fabricated
  // infinite/zero ratio. A known simplification: this is technically a
  // missing-cost-data case, not a missing-value-data case, but a single
  // status keeps the contract simple — see docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md.
  if (totalCost === 0) {
    return { status: "INSUFFICIENT_VALUE_DATA" };
  }

  return {
    status: "COMPUTED",
    totalValue: Math.round(totalValue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    roi: Math.round(((totalValue - totalCost) / totalCost) * 10000) / 10000,
    conversionsWithValue: valueRows.length,
  };
}
