import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { isSuppressed, getEffectiveConsent } from "@/lib/commercial-memory/consent";
import { checkFrequencyGuard } from "./frequency-guard";

// Retargeting eligibility as a DECISION, never an automatic execution —
// Phase 4 brief Section 20. This module only ever writes an eligibility
// record; it never creates or launches a distribution plan. A human (or a
// future Phase 5+ workflow) reads ELIGIBLE and decides whether to prepare
// a Phase 3 distribution plan.

export type Eligibility = (typeof schema.retargetingEligibilityEnum.enumValues)[number];
export type Channel = (typeof schema.channelTypeEnum.enumValues)[number];

const RELEVANT_INTERACTION_WINDOW_DAYS = 180;

export interface EvaluateRetargetingInput {
  profileId: string;
  campaignId?: string | null;
  channel?: Channel | null;
}

export interface RetargetingDecision {
  eligibility: Eligibility;
  reason: string;
  checks: Record<string, unknown>;
}

export async function evaluateRetargetingEligibility(input: EvaluateRetargetingInput): Promise<RetargetingDecision> {
  const [profile] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, input.profileId)).limit(1);
  if (!profile) throw new Error("Profile not found");

  const suppressed = await isSuppressed(input.profileId);
  if (suppressed) {
    return {
      eligibility: "NOT_ELIGIBLE",
      reason: "Profile is suppressed (opt-out/do-not-contact/policy/compliance).",
      checks: { suppressed: true },
    };
  }

  const consent = await getEffectiveConsent(input.profileId, input.channel ?? undefined);
  if (consent === "DENIED" || consent === "WITHDRAWN") {
    return {
      eligibility: "NOT_ELIGIBLE",
      reason: `Marketing consent is ${consent} for the requested channel.`,
      checks: { consent },
    };
  }

  const touches = await db.select().from(schema.touchpoints).where(eq(schema.touchpoints.profileId, input.profileId));
  const mostRecent = touches
    .map((t) => t.occurredAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const hasRelevantRecentInteraction =
    !!mostRecent &&
    (Date.now() - mostRecent.getTime()) / (1000 * 60 * 60 * 24) <= RELEVANT_INTERACTION_WINDOW_DAYS;

  if (!hasRelevantRecentInteraction) {
    return {
      eligibility: "NOT_ELIGIBLE",
      reason: `No relevant interaction within the last ${RELEVANT_INTERACTION_WINDOW_DAYS} days.`,
      checks: { hasRelevantRecentInteraction, lastInteractionAt: mostRecent ?? null },
    };
  }

  const frequency = await checkFrequencyGuard(input.profileId);
  if (!frequency.withinLimits) {
    return {
      eligibility: "NOT_ELIGIBLE",
      reason: `Frequency guard: ${frequency.reason}`,
      checks: { frequency },
    };
  }

  if (input.channel && !profile.eligibleChannels.includes(input.channel)) {
    return {
      eligibility: "NEEDS_REVIEW",
      reason: `Requested channel (${input.channel}) is not in this profile's known eligible channels — needs human review before use.`,
      checks: { requestedChannel: input.channel, eligibleChannels: profile.eligibleChannels },
    };
  }

  if (consent === "UNKNOWN") {
    return {
      eligibility: "NEEDS_REVIEW",
      reason: "No recorded consent decision on file for this channel — needs review before retargeting.",
      checks: { consent },
    };
  }

  return {
    eligibility: "ELIGIBLE",
    reason: "Not suppressed, consent granted, relevant recent interaction, within frequency limits.",
    checks: {
      suppressed: false,
      consent,
      hasRelevantRecentInteraction,
      lastInteractionAt: mostRecent ?? null,
      frequency,
    },
  };
}

export async function recordRetargetingEligibility(
  input: EvaluateRetargetingInput,
  evaluatedByUserId: string | null
) {
  const decision = await evaluateRetargetingEligibility(input);

  const [row] = await db
    .insert(schema.retargetingEligibility)
    .values({
      profileId: input.profileId,
      campaignId: input.campaignId ?? null,
      channel: input.channel ?? null,
      eligibility: decision.eligibility,
      reason: decision.reason,
      checks: decision.checks,
      evaluatedByUserId: evaluatedByUserId ?? null,
    })
    .returning();

  await recordAuditEvent({
    eventType: "RETARGETING_ELIGIBILITY_CHANGED",
    actorUserId: evaluatedByUserId ?? undefined,
    targetType: "audience_profile",
    targetId: input.profileId,
    metadata: { eligibility: decision.eligibility, campaignId: input.campaignId ?? null, channel: input.channel ?? null },
  });

  return row!;
}

export async function getCurrentRetargetingEligibility(profileId: string) {
  const [row] = await db
    .select()
    .from(schema.retargetingEligibility)
    .where(eq(schema.retargetingEligibility.profileId, profileId))
    .orderBy(desc(schema.retargetingEligibility.createdAt))
    .limit(1);
  return row ?? null;
}
