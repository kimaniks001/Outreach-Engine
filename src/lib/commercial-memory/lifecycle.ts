import { desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { isSuppressed } from "./consent";

// Deterministic lifecycle state engine — docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md
// Section 3 / Phase 4 brief Section 9. No ML, no subjective AI judgment: the
// state is recomputed from the profile's full touchpoint/journey/
// conversion/suppression history every time, so it is always reproducible
// and never depends on the order events happened to arrive in — see
// docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md.

export const LIFECYCLE_ENGINE_VERSION = "phase4-lifecycle-v1";

// Objective, configurable thresholds — not subjective profiling. A
// reasonable future step is moving these to system_settings; hardcoded
// constants are sufficient for Phase 4's scope (documented limitation).
export const LIFECYCLE_CONFIG = {
  dormantThresholdDays: 90,
  highValueMinConversions: 5,
  activeMinRepeatTouches: 2,
};

const INTEREST_TOUCH_TYPES = ["DEMO_STARTED", "DEMO_COMPLETED", "FORM_SUBMITTED"] as const;
const ENGAGEMENT_TOUCH_TYPES = [
  "AD_CLICK",
  "LANDING_PAGE_VIEW",
  "DEMO_STARTED",
  "DEMO_COMPLETED",
  "FORM_SUBMITTED",
  "REPLY_RECEIVED",
] as const;
// KSNUMBER_CREATED is deliberately excluded — that is the REGISTERED
// signal (docs/AUDIENCE_AND_CONVERSION_ARCHITECTURE.md Section 3:
// "REGISTERED: KSNumber/account registration event" vs "FIRST_USE: first
// successful SecurePay product use"). Registering is not yet "using."
const FIRST_USE_CONVERSION_TYPES = [
  "FIRST_SECURELINK",
  "FIRST_KEYCONTRACT",
  "FIRST_GROUP_SECURELINK",
  "FIRST_SECUREFLOW",
  "PAYMENT_COMMITTED",
  "AGREEMENT_COMPLETED",
  "SETTLEMENT_COMPLETED",
] as const;

export interface LifecycleAssessment {
  state: (typeof schema.lifecycleStateEnum.enumValues)[number];
  reasons: string[];
}

export async function assessLifecycle(profileId: string): Promise<LifecycleAssessment> {
  const reasons: string[] = [];

  const suppressed = await isSuppressed(profileId);
  if (suppressed) {
    return { state: "SUPPRESSED", reasons: ["Active suppression record overrides all other state."] };
  }

  const [profile] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error("Profile not found");

  const touches = await db
    .select()
    .from(schema.touchpoints)
    .where(eq(schema.touchpoints.profileId, profileId))
    .orderBy(desc(schema.touchpoints.occurredAt));
  const journeys = await db.select().from(schema.productJourneys).where(eq(schema.productJourneys.profileId, profileId));
  const conversions = await db
    .select()
    .from(schema.conversionEvents)
    .where(eq(schema.conversionEvents.profileId, profileId));

  const completedJourneys = journeys.filter((j) => j.status === "COMPLETED");
  const repeatUseConversions = conversions.filter((c) => c.conversionType === "REPEAT_USE");
  const firstUseConversions = conversions.filter((c) =>
    (FIRST_USE_CONVERSION_TYPES as readonly string[]).includes(c.conversionType)
  );
  const registeredSignal =
    profile.profileType === "KSNUMBER" ||
    !!profile.ksNumberRef ||
    conversions.some((c) => c.conversionType === "KSNUMBER_CREATED") ||
    touches.some((t) => t.type === "KSNUMBER_CREATED");

  if (conversions.length >= LIFECYCLE_CONFIG.highValueMinConversions) {
    reasons.push(
      `${conversions.length} recorded conversions meets/exceeds the objective HIGH_VALUE threshold (${LIFECYCLE_CONFIG.highValueMinConversions}).`
    );
    return { state: "HIGH_VALUE", reasons };
  }

  const lastActivityAt = [
    ...touches.map((t) => t.occurredAt),
    ...journeys.map((j) => j.lastActivityAt),
    ...conversions.map((c) => c.occurredAt),
  ].sort((a, b) => b.getTime() - a.getTime())[0];

  const everEngaged = touches.some((t) => (ENGAGEMENT_TOUCH_TYPES as readonly string[]).includes(t.type));
  if (lastActivityAt && everEngaged) {
    const daysSince = (Date.now() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > LIFECYCLE_CONFIG.dormantThresholdDays) {
      reasons.push(
        `No meaningful activity in ${Math.floor(daysSince)} days, exceeding the DORMANT threshold (${LIFECYCLE_CONFIG.dormantThresholdDays}).`
      );
      return { state: "DORMANT", reasons };
    }
  }

  if (completedJourneys.length >= LIFECYCLE_CONFIG.activeMinRepeatTouches || repeatUseConversions.length > 0) {
    reasons.push(
      `${completedJourneys.length} completed product journeys / ${repeatUseConversions.length} repeat-use conversions indicate ongoing regular use.`
    );
    return { state: "ACTIVE", reasons };
  }

  if (completedJourneys.length >= 1 || firstUseConversions.length >= 1) {
    reasons.push("At least one completed product journey or first-use conversion recorded.");
    return { state: "FIRST_USE", reasons };
  }

  if (registeredSignal) {
    reasons.push("KSNumber/account registration signal present.");
    return { state: "REGISTERED", reasons };
  }

  if (touches.some((t) => (INTEREST_TOUCH_TYPES as readonly string[]).includes(t.type))) {
    reasons.push("Explicit interest touchpoint recorded (demo/form).");
    return { state: "INTERESTED", reasons };
  }

  if (everEngaged) {
    reasons.push("Meaningful engagement touchpoint recorded (click/view/demo/reply).");
    return { state: "ENGAGED", reasons };
  }

  if (touches.length > 0) {
    reasons.push("A distribution touch was recorded but no engagement yet.");
    return { state: "REACHED", reasons };
  }

  reasons.push("No recorded interaction history.");
  return { state: "UNKNOWN", reasons };
}

// Called after any event that could change lifecycle state (touchpoint
// recorded, journey transition, product event processed, suppression
// change). Writes only occur on an actual state change so LIFECYCLE_CHANGED
// audit events stay meaningful rather than noisy.
export async function recomputeLifecycle(profileId: string): Promise<LifecycleAssessment> {
  const assessment = await assessLifecycle(profileId);

  const [profile] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error("Profile not found");

  if (profile.lifecycleState !== assessment.state) {
    await db
      .update(schema.audienceProfiles)
      .set({ lifecycleState: assessment.state, updatedAt: new Date() })
      .where(eq(schema.audienceProfiles.id, profileId));

    await recordAuditEvent({
      eventType: "LIFECYCLE_CHANGED",
      targetType: "audience_profile",
      targetId: profileId,
      metadata: { from: profile.lifecycleState, to: assessment.state, reasons: assessment.reasons, engineVersion: LIFECYCLE_ENGINE_VERSION },
    });
  }

  return assessment;
}

// Batch dormancy sweep — no scheduler exists in this phase (no background
// job infrastructure), so this is invoked on-demand (e.g. from the Impact
// dashboard or a manual admin action) rather than via a cron. Only touches
// profiles that were previously engaged and have gone quiet.
export async function sweepDormantProfiles(): Promise<string[]> {
  const candidates = await db
    .select({ id: schema.audienceProfiles.id })
    .from(schema.audienceProfiles)
    .where(isNull(schema.audienceProfiles.mergedIntoProfileId));

  const changed: string[] = [];
  for (const { id } of candidates) {
    const before = await db.select({ lifecycleState: schema.audienceProfiles.lifecycleState }).from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, id)).limit(1);
    const assessment = await recomputeLifecycle(id);
    if (before[0] && before[0].lifecycleState !== assessment.state && assessment.state === "DORMANT") {
      changed.push(id);
    }
  }
  return changed;
}
