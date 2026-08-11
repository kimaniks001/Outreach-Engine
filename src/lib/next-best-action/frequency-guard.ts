import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Simple contact frequency / fatigue guard — Phase 4 brief Section 41.
// Shared by the next-best-action engine and retargeting eligibility so
// both apply the exact same cap. Configurable, deterministic — no ML.

export const FREQUENCY_GUARD_CONFIG = {
  minIntervalDays: 3,
  maxTouchesInWindow: 3,
  windowDays: 30,
};

const OUTREACH_TOUCH_TYPES = ["OUTREACH_PLANNED", "OUTREACH_SENT"] as const;

export interface FrequencyGuardResult {
  withinLimits: boolean;
  reason: string;
  lastOutreachAt: Date | null;
  touchesInWindow: number;
}

export async function checkFrequencyGuard(profileId: string, now: Date = new Date()): Promise<FrequencyGuardResult> {
  const windowStart = new Date(now.getTime() - FREQUENCY_GUARD_CONFIG.windowDays * 24 * 60 * 60 * 1000);

  const recent = await db
    .select({ occurredAt: schema.touchpoints.occurredAt })
    .from(schema.touchpoints)
    .where(
      and(
        eq(schema.touchpoints.profileId, profileId),
        inArray(schema.touchpoints.type, [...OUTREACH_TOUCH_TYPES]),
        gte(schema.touchpoints.occurredAt, windowStart)
      )
    );

  const touchesInWindow = recent.length;
  const lastOutreachAt = recent.reduce<Date | null>(
    (latest, r) => (!latest || r.occurredAt > latest ? r.occurredAt : latest),
    null
  );

  if (lastOutreachAt) {
    const daysSince = (now.getTime() - lastOutreachAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < FREQUENCY_GUARD_CONFIG.minIntervalDays) {
      return {
        withinLimits: false,
        reason: `Last outreach touch was ${daysSince.toFixed(1)} days ago, below the ${FREQUENCY_GUARD_CONFIG.minIntervalDays}-day minimum interval.`,
        lastOutreachAt,
        touchesInWindow,
      };
    }
  }

  if (touchesInWindow >= FREQUENCY_GUARD_CONFIG.maxTouchesInWindow) {
    return {
      withinLimits: false,
      reason: `${touchesInWindow} outreach touches in the last ${FREQUENCY_GUARD_CONFIG.windowDays} days meets/exceeds the cap of ${FREQUENCY_GUARD_CONFIG.maxTouchesInWindow}.`,
      lastOutreachAt,
      touchesInWindow,
    };
  }

  return { withinLimits: true, reason: "Within frequency limits.", lastOutreachAt, touchesInWindow };
}
