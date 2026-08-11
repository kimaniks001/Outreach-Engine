import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { isSuppressed, getEffectiveConsent } from "@/lib/commercial-memory/consent";
import { checkFrequencyGuard } from "./frequency-guard";
import { explainNextBestAction } from "@/lib/ai/tasks/explain-next-best-action";

// Deterministic, explainable Next-Best-Action engine — Phase 4 brief
// Sections 17-19/40/41. Eligibility is always decided here, never by AI —
// see docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md. AI may only
// add narrative text after the decision is made (src/lib/ai/tasks/explain-next-best-action.ts).

export const NBA_ENGINE_VERSION = "phase4-nba-v1";

export type NbaActionType = (typeof schema.nbaActionTypeEnum.enumValues)[number];
export type Priority = (typeof schema.urgencyEnum.enumValues)[number];

export interface NbaDecision {
  actionType: NbaActionType;
  reason: string;
  priority: Priority;
  eligibleChannels: string[];
  relatedProduct: string | null;
  cta: string | null;
  triggeringState: Record<string, unknown>;
  blockedActions: string[];
  suppressionState: string;
}

const REPEAT_SECURELINK_THRESHOLD = 2;

async function evaluateUpsellCandidate(
  profileId: string
): Promise<{ actionType: "UPSELL" | "CROSS_SELL"; relatedProduct: string; cta: string; reason: string } | null> {
  const touches = await db.select().from(schema.touchpoints).where(eq(schema.touchpoints.profileId, profileId));

  const secureLinkCount = touches.filter((t) => t.type === "SECURELINK_CREATED").length;
  const hasKeyContract = touches.some((t) => t.type === "KEYCONTRACT_CREATED");
  if (secureLinkCount >= REPEAT_SECURELINK_THRESHOLD && !hasKeyContract) {
    return {
      actionType: "UPSELL",
      relatedProduct: "KeyContract",
      cta: "Explore KeyContract for ongoing work",
      reason: `${secureLinkCount} SecureLinks created with no KeyContract yet — repeated one-to-one use is evidence for KeyContract relevance.`,
    };
  }

  const groupSecureLinkCount = touches.filter((t) => t.type === "GROUP_SECURELINK_CREATED").length;
  const hasSecureFlow = touches.some((t) => t.type === "SECUREFLOW_CREATED");
  if (groupSecureLinkCount >= 1 && !hasSecureFlow) {
    return {
      actionType: "CROSS_SELL",
      relatedProduct: "SecureFlow",
      cta: "See how SecureFlow handles governed one-to-many payouts",
      reason: `${groupSecureLinkCount} Group SecureLink(s) created — evidence of one-to-many payout needs suggests SecureFlow relevance.`,
    };
  }

  return null;
}

export async function computeNextBestAction(profileId: string): Promise<NbaDecision> {
  const [profile] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error("Profile not found");

  const suppressed = await isSuppressed(profileId);
  const consent = await getEffectiveConsent(profileId);
  const blockedActions: string[] = [];

  if (suppressed) {
    return {
      actionType: "SUPPRESS",
      reason: "Profile is suppressed (opt-out/do-not-contact/policy/compliance) — no outreach action is eligible.",
      priority: "HIGH",
      eligibleChannels: [],
      relatedProduct: null,
      cta: null,
      triggeringState: { lifecycleState: profile.lifecycleState },
      blockedActions: ["All actions blocked: profile is suppressed."],
      suppressionState: "SUPPRESSED",
    };
  }

  const eligibleChannels =
    consent === "DENIED" || consent === "WITHDRAWN" ? [] : profile.eligibleChannels;
  if (consent === "DENIED" || consent === "WITHDRAWN") {
    blockedActions.push(`Marketing consent is ${consent} — no channel is eligible for outreach-shaped actions.`);
  }

  const allJourneys = await db.select().from(schema.productJourneys).where(eq(schema.productJourneys.profileId, profileId));

  // A journeyType that has since been completed by ANY journey instance
  // (e.g. the profile came back and finished it in a fresh session — see
  // src/lib/product-events/ingest.ts's "no open journey found" branch)
  // resolves every earlier abandoned instance of that same type: it is no
  // longer something to resume.
  const completedJourneyTypes = new Set(allJourneys.filter((j) => j.status === "COMPLETED").map((j) => j.journeyType));

  const openAbandoned = allJourneys
    .filter((j) => j.status === "ABANDONED" && !completedJourneyTypes.has(j.journeyType))
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())[0];

  const openInProgress = allJourneys
    .filter((j) => j.status === "STARTED" || j.status === "IN_PROGRESS")
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())[0];

  const frequency = await checkFrequencyGuard(profileId);

  function guardedDecision(base: Omit<NbaDecision, "eligibleChannels" | "suppressionState" | "blockedActions">): NbaDecision {
    if (base.actionType === "NO_ACTION" || base.actionType === "SUPPRESS") {
      return { ...base, eligibleChannels, suppressionState: "NOT_SUPPRESSED", blockedActions };
    }
    if (!frequency.withinLimits) {
      blockedActions.push(`${base.actionType} blocked by frequency guard: ${frequency.reason}`);
      return {
        actionType: "NO_ACTION",
        reason: `Frequency guard: ${frequency.reason}`,
        priority: "LOW",
        relatedProduct: null,
        cta: null,
        triggeringState: base.triggeringState,
        eligibleChannels,
        suppressionState: "NOT_SUPPRESSED",
        blockedActions,
      };
    }
    if (eligibleChannels.length === 0) {
      blockedActions.push(`${base.actionType} has no eligible channel (consent or segment channel eligibility).`);
      return {
        actionType: "NO_ACTION",
        reason: "No eligible channel — consent or channel-eligibility check failed.",
        priority: "LOW",
        relatedProduct: null,
        cta: null,
        triggeringState: base.triggeringState,
        eligibleChannels,
        suppressionState: "NOT_SUPPRESSED",
        blockedActions,
      };
    }
    return { ...base, eligibleChannels, suppressionState: "NOT_SUPPRESSED", blockedActions };
  }

  if (openAbandoned) {
    return guardedDecision({
      actionType: "RESUME_JOURNEY",
      reason: `Journey "${openAbandoned.journeyType}" was abandoned at step "${openAbandoned.currentStep}": ${openAbandoned.abandonmentReason ?? "no activity within threshold."}`,
      priority: "HIGH",
      relatedProduct: openAbandoned.journeyType,
      cta: openAbandoned.resumeReference ? `Resume: ${openAbandoned.resumeReference}` : "Resume where you left off",
      triggeringState: { lifecycleState: profile.lifecycleState, abandonedJourneyId: openAbandoned.id },
    });
  }

  switch (profile.lifecycleState) {
    case "UNKNOWN":
      return guardedDecision({
        actionType: "NO_ACTION",
        reason: "No recorded interaction yet — nothing to act on.",
        priority: "LOW",
        relatedProduct: null,
        cta: null,
        triggeringState: { lifecycleState: profile.lifecycleState },
      });

    case "REACHED":
      return guardedDecision({
        actionType: "EDUCATE",
        reason: "Reached but no engagement yet — awareness/education content is the appropriate next step.",
        priority: "LOW",
        relatedProduct: null,
        cta: "Learn how SecurePay protects milestone payments",
        triggeringState: { lifecycleState: profile.lifecycleState },
      });

    case "ENGAGED":
      return guardedDecision({
        actionType: "EDUCATE",
        reason: "Engaged but has not yet expressed explicit interest — continue building awareness.",
        priority: "MEDIUM",
        relatedProduct: null,
        cta: "See how it works",
        triggeringState: { lifecycleState: profile.lifecycleState },
      });

    case "INTERESTED":
      return guardedDecision({
        actionType: "REQUEST_DEMO",
        reason: "Explicit interest recorded (demo/form) — invite a demo or guided walkthrough.",
        priority: "MEDIUM",
        relatedProduct: null,
        cta: "Book a walkthrough",
        triggeringState: { lifecycleState: profile.lifecycleState },
      });

    case "REGISTERED": {
      if (openInProgress) {
        return guardedDecision({
          actionType: "NO_ACTION",
          reason: `Already progressing an active "${openInProgress.journeyType}" journey — no additional nudge needed.`,
          priority: "LOW",
          relatedProduct: null,
          cta: null,
          triggeringState: { lifecycleState: profile.lifecycleState, journeyId: openInProgress.id },
        });
      }
      return guardedDecision({
        actionType: "CREATE_FIRST_PRODUCT",
        reason: "Registered (KSNumber) but no product use yet — guide toward the first SecureLink.",
        priority: "MEDIUM",
        relatedProduct: "SecureLink",
        cta: "Start your first SecureLink",
        triggeringState: { lifecycleState: profile.lifecycleState },
      });
    }

    case "FIRST_USE":
      return guardedDecision({
        actionType: "REPEAT_USE",
        reason: "First successful product use recorded — encourage repeat use.",
        priority: "MEDIUM",
        relatedProduct: "SecureLink",
        cta: "Use SecureLink again for your next agreement",
        triggeringState: { lifecycleState: profile.lifecycleState },
      });

    case "ACTIVE": {
      const upsell = await evaluateUpsellCandidate(profileId);
      if (upsell) {
        return guardedDecision({
          actionType: upsell.actionType,
          reason: upsell.reason,
          priority: "MEDIUM",
          relatedProduct: upsell.relatedProduct,
          cta: upsell.cta,
          triggeringState: { lifecycleState: profile.lifecycleState },
        });
      }
      blockedActions.push("UPSELL/CROSS_SELL: no qualifying repeat-use or group-SecureLink evidence found.");
      return guardedDecision({
        actionType: "NO_ACTION",
        reason: "Active user with no specific upsell/cross-sell evidence yet.",
        priority: "LOW",
        relatedProduct: null,
        cta: null,
        triggeringState: { lifecycleState: profile.lifecycleState },
      });
    }

    case "HIGH_VALUE": {
      const upsell = await evaluateUpsellCandidate(profileId);
      if (upsell) {
        return guardedDecision({
          actionType: upsell.actionType,
          reason: upsell.reason,
          priority: "HIGH",
          relatedProduct: upsell.relatedProduct,
          cta: upsell.cta,
          triggeringState: { lifecycleState: profile.lifecycleState },
        });
      }
      return guardedDecision({
        actionType: "BUSINESS_CONTACT",
        reason: "High-value profile — recommend a human commercial follow-up rather than automated messaging.",
        priority: "HIGH",
        relatedProduct: null,
        cta: null,
        triggeringState: { lifecycleState: profile.lifecycleState },
      });
    }

    case "DORMANT":
      return guardedDecision({
        actionType: "EDUCATE",
        reason: "Previously engaged but has gone quiet — light re-engagement content is appropriate.",
        priority: "LOW",
        relatedProduct: null,
        cta: "See what's new",
        triggeringState: { lifecycleState: profile.lifecycleState },
      });

    default:
      return guardedDecision({
        actionType: "NO_ACTION",
        reason: `No rule defined for lifecycle state ${profile.lifecycleState}.`,
        priority: "LOW",
        relatedProduct: null,
        cta: null,
        triggeringState: { lifecycleState: profile.lifecycleState },
      });
  }
}

export interface RecomputeOptions {
  useAiNarrative?: boolean;
  requestedByUserId?: string;
  generatedByUserId?: string | null;
}

// Persists the deterministic decision as a new append-only row (current =
// latest row per profile). Optional AI narrative enrichment only ever
// appends a sentence to `reason` — it never touches actionType, priority,
// eligibleChannels, or any suppression/consent result.
export async function recomputeNextBestAction(profileId: string, options: RecomputeOptions = {}) {
  const decision = await computeNextBestAction(profileId);

  let reason = decision.reason;
  let aiNarrativeUsed = false;
  let aiUsageRecordId: string | null = null;

  if (options.useAiNarrative && options.requestedByUserId && decision.actionType !== "SUPPRESS") {
    const [profile] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, profileId)).limit(1);
    const enrichment = await explainNextBestAction({
      actionType: decision.actionType,
      reason: decision.reason,
      lifecycleState: profile?.lifecycleState ?? "UNKNOWN",
      requestedByUserId: options.requestedByUserId,
    });
    if (enrichment.narrative) {
      reason = `${decision.reason} ${enrichment.narrative}`;
      aiNarrativeUsed = true;
    }
    aiUsageRecordId = enrichment.aiUsageRecordId;
  }

  const [row] = await db
    .insert(schema.nextBestActions)
    .values({
      profileId,
      actionType: decision.actionType,
      reason,
      priority: decision.priority,
      eligibleChannels: decision.eligibleChannels,
      relatedProduct: decision.relatedProduct,
      cta: decision.cta,
      triggeringState: decision.triggeringState,
      blockedActions: decision.blockedActions,
      suppressionState: decision.suppressionState,
      ruleEngineVersion: NBA_ENGINE_VERSION,
      aiNarrativeUsed,
      aiUsageRecordId,
      generatedByUserId: options.generatedByUserId ?? null,
    })
    .returning();

  await recordAuditEvent({
    eventType: "NEXT_BEST_ACTION_CHANGED",
    actorUserId: options.generatedByUserId ?? undefined,
    targetType: "audience_profile",
    targetId: profileId,
    metadata: { actionType: decision.actionType, priority: decision.priority, aiNarrativeUsed },
  });

  return row!;
}

export async function getCurrentNextBestAction(profileId: string) {
  const [row] = await db
    .select()
    .from(schema.nextBestActions)
    .where(eq(schema.nextBestActions.profileId, profileId))
    .orderBy(desc(schema.nextBestActions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listNextBestActionHistory(profileId: string) {
  return db
    .select()
    .from(schema.nextBestActions)
    .where(eq(schema.nextBestActions.profileId, profileId))
    .orderBy(desc(schema.nextBestActions.createdAt));
}
