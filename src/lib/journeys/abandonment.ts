import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { abandonJourney, type JourneyType } from "./journeys";

// Deterministic, threshold-based abandonment detection — Phase 4 brief
// Section 16. Never instant, never infers emotional/personal context. No
// scheduler exists in this phase (no background job infrastructure — see
// Non-Goals), so this runs on demand: from the Impact dashboard, an admin
// action, or the product-event simulator's "advance time" helper. A
// reasonable Phase 5 candidate is wiring this to a cron.

export const ABANDONMENT_THRESHOLD_MINUTES: Record<JourneyType, number> = {
  DEMO: 60,
  KSNUMBER_REGISTRATION: 24 * 60,
  SECURELINK_CREATION: 24 * 60,
  KEYCONTRACT_CREATION: 48 * 60,
  GROUP_SECURELINK_CREATION: 48 * 60,
  SECUREFLOW_CREATION: 48 * 60,
  BUSINESS_ONBOARDING: 7 * 24 * 60,
  API_INTEGRATION: 7 * 24 * 60,
};

const OPEN_STATUSES = ["STARTED", "IN_PROGRESS"] as const;

export function isPastAbandonmentThreshold(
  journeyType: JourneyType,
  lastActivityAt: Date,
  now: Date = new Date()
): boolean {
  const thresholdMs = ABANDONMENT_THRESHOLD_MINUTES[journeyType] * 60 * 1000;
  return now.getTime() - lastActivityAt.getTime() > thresholdMs;
}

// Sweeps every open journey and abandons the ones past their type-specific
// threshold. Returns the profileIds affected so callers can recompute
// next-best-action for them.
export async function sweepAbandonedJourneys(now: Date = new Date()): Promise<string[]> {
  const openJourneys = await db
    .select()
    .from(schema.productJourneys)
    .where(inArray(schema.productJourneys.status, [...OPEN_STATUSES]));

  const affectedProfileIds: string[] = [];

  for (const journey of openJourneys) {
    if (isPastAbandonmentThreshold(journey.journeyType, journey.lastActivityAt, now)) {
      const hours = Math.floor((now.getTime() - journey.lastActivityAt.getTime()) / (1000 * 60 * 60));
      await abandonJourney(
        journey.id,
        `No activity for ${hours} hours, exceeding the ${Math.floor(
          ABANDONMENT_THRESHOLD_MINUTES[journey.journeyType] / 60
        )}-hour threshold for ${journey.journeyType}.`
      );
      affectedProfileIds.push(journey.profileId);
    }
  }

  return affectedProfileIds;
}

export async function forceCheckJourney(journeyId: string, now: Date = new Date()) {
  const [journey] = await db.select().from(schema.productJourneys).where(eq(schema.productJourneys.id, journeyId)).limit(1);
  if (!journey) return null;
  if (!(OPEN_STATUSES as readonly string[]).includes(journey.status)) return journey;
  if (!isPastAbandonmentThreshold(journey.journeyType, journey.lastActivityAt, now)) return journey;

  const hours = Math.floor((now.getTime() - journey.lastActivityAt.getTime()) / (1000 * 60 * 60));
  return abandonJourney(
    journeyId,
    `No activity for ${hours} hours, exceeding the ${Math.floor(
      ABANDONMENT_THRESHOLD_MINUTES[journey.journeyType] / 60
    )}-hour threshold for ${journey.journeyType}.`
  );
}
