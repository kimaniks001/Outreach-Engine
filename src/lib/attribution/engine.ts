import { schema } from "@/lib/db";

// Multi-touch attribution — Phase 4 brief Section 23. Every model is a
// pure, deterministic function of the sorted eligible-touch list, so
// attribution is always reproducible from the preserved touch history
// (Section 39). Attribution is not causation — this is a transparent
// credit-splitting convention, not a claim about what "caused" the
// conversion.

export const ATTRIBUTION_ENGINE_VERSION = "phase4-attribution-v1";

export type AttributionModel = (typeof schema.attributionModelEnum.enumValues)[number];
export const ATTRIBUTION_MODELS: AttributionModel[] = ["FIRST_TOUCH", "LAST_TOUCH", "LINEAR", "MULTI_TOUCH"];

// Only marketing/distribution touches earn attribution credit — product
// milestone touchpoints (KSNUMBER_CREATED, SECURELINK_CREATED, ...)
// represent the conversion itself, not a step in the path to it.
export const ATTRIBUTABLE_TOUCH_TYPES: Array<(typeof schema.touchpointTypeEnum.enumValues)[number]> = [
  "AD_IMPRESSION",
  "AD_CLICK",
  "LANDING_PAGE_VIEW",
  "DEMO_STARTED",
  "DEMO_COMPLETED",
  "FORM_SUBMITTED",
  "OUTREACH_PLANNED",
  "OUTREACH_SENT",
  "REPLY_RECEIVED",
  "REFERRAL_CREATED",
];

export interface AttributableTouch {
  id: string;
  campaignId: string | null;
  distributionPlanId: string | null;
  channel: string | null;
  occurredAt: Date;
}

export interface AttributionWeight {
  touchpointId: string;
  campaignId: string | null;
  distributionPlanId: string | null;
  channel: string | null;
  attributionModel: AttributionModel;
  weight: number;
  rationale: string;
}

function sortedByTime(touches: AttributableTouch[]): AttributableTouch[] {
  return [...touches].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

export function computeAttributionWeights(touches: AttributableTouch[]): AttributionWeight[] {
  const sorted = sortedByTime(touches);
  if (sorted.length === 0) return [];

  const results: AttributionWeight[] = [];

  const first = sorted[0]!;
  results.push({
    touchpointId: first.id,
    campaignId: first.campaignId,
    distributionPlanId: first.distributionPlanId,
    channel: first.channel,
    attributionModel: "FIRST_TOUCH",
    weight: 1,
    rationale: `Earliest of ${sorted.length} preserved touch(es) — FIRST_TOUCH credits it 100%.`,
  });

  const last = sorted[sorted.length - 1]!;
  results.push({
    touchpointId: last.id,
    campaignId: last.campaignId,
    distributionPlanId: last.distributionPlanId,
    channel: last.channel,
    attributionModel: "LAST_TOUCH",
    weight: 1,
    rationale: `Latest of ${sorted.length} preserved touch(es) before conversion — LAST_TOUCH credits it 100%.`,
  });

  const linearWeight = 1 / sorted.length;
  for (const touch of sorted) {
    results.push({
      touchpointId: touch.id,
      campaignId: touch.campaignId,
      distributionPlanId: touch.distributionPlanId,
      channel: touch.channel,
      attributionModel: "LINEAR",
      weight: round4(linearWeight),
      rationale: `Equal credit split across all ${sorted.length} preserved touch(es) (1/${sorted.length}).`,
    });
  }

  results.push(...multiTouchWeights(sorted));

  return results;
}

// Position-based ("U-shaped") assisted model: 40% first touch, 40% last
// touch, remaining 20% split evenly across the touches in between. Falls
// back gracefully for 1-2 touch paths. Deterministic, explainable — no
// black-box weighting.
function multiTouchWeights(sorted: AttributableTouch[]): AttributionWeight[] {
  const n = sorted.length;
  if (n === 1) {
    return [
      {
        touchpointId: sorted[0]!.id,
        campaignId: sorted[0]!.campaignId,
        distributionPlanId: sorted[0]!.distributionPlanId,
        channel: sorted[0]!.channel,
        attributionModel: "MULTI_TOUCH",
        weight: 1,
        rationale: "Only one preserved touch — MULTI_TOUCH credits it 100%.",
      },
    ];
  }
  if (n === 2) {
    return sorted.map((t, i) => ({
      touchpointId: t.id,
      campaignId: t.campaignId,
      distributionPlanId: t.distributionPlanId,
      channel: t.channel,
      attributionModel: "MULTI_TOUCH" as const,
      weight: 0.5,
      rationale: `Two preserved touches — MULTI_TOUCH position-based model splits credit 50/50 (${
        i === 0 ? "first" : "last"
      } touch).`,
    }));
  }

  const middleWeight = round4(0.2 / (n - 2));
  return sorted.map((t, i) => {
    const isFirst = i === 0;
    const isLast = i === n - 1;
    const weight = isFirst || isLast ? 0.4 : middleWeight;
    const label = isFirst ? "first touch (40%)" : isLast ? "last touch (40%)" : "assisting middle touch (20% shared)";
    return {
      touchpointId: t.id,
      campaignId: t.campaignId,
      distributionPlanId: t.distributionPlanId,
      channel: t.channel,
      attributionModel: "MULTI_TOUCH" as const,
      weight,
      rationale: `Position-based MULTI_TOUCH model across ${n} preserved touches — ${label}.`,
    };
  });
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
