import { and, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

// Minimal retention review closure — Phase 5 brief Section 32. A profile
// only ever becomes purge/anonymize-eligible after an explicit
// retentionUntil has been set on it (Phase 4's default is null — "no
// defined retention limit yet") — nothing is auto-eligible just by being
// old. legalHold always blocks. Never a silent delete: anonymization
// clears RESTRICTED identifiers while preserving lifecycle/touchpoint/
// conversion aggregates (Section 32: "Prefer anonymization where
// historical aggregates should remain").

export interface RetentionCandidate {
  profileId: string;
  retentionUntil: Date;
  legalHold: boolean;
  lifecycleState: string;
  lastSeenAt: Date;
}

export async function listRetentionReviewCandidates(now: Date = new Date()): Promise<RetentionCandidate[]> {
  const rows = await db
    .select({
      id: schema.audienceProfiles.id,
      retentionUntil: schema.audienceProfiles.retentionUntil,
      legalHold: schema.audienceProfiles.legalHold,
      lifecycleState: schema.audienceProfiles.lifecycleState,
      lastSeenAt: schema.audienceProfiles.lastSeenAt,
      retentionClass: schema.audienceProfiles.retentionClass,
    })
    .from(schema.audienceProfiles)
    .where(and(isNotNull(schema.audienceProfiles.retentionUntil), lte(schema.audienceProfiles.retentionUntil, now), isNull(schema.audienceProfiles.mergedIntoProfileId)));

  return rows
    .filter((r) => r.retentionClass !== "anonymized")
    .map((r) => ({
      profileId: r.id,
      retentionUntil: r.retentionUntil!,
      legalHold: r.legalHold,
      lifecycleState: r.lifecycleState,
      lastSeenAt: r.lastSeenAt,
    }));
}

export async function markReviewed(profileId: string, actorUserId: string, reason: string) {
  const [row] = await db
    .insert(schema.retentionActions)
    .values({ profileId, action: "REVIEWED", reason, performedByUserId: actorUserId })
    .returning();

  await recordAuditEvent({
    eventType: "RETENTION_REVIEWED",
    actorUserId,
    targetType: "audience_profile",
    targetId: profileId,
    metadata: { reason },
  });

  return row!;
}

export class LegalHoldError extends Error {}

// Owner-only (enforced by the caller). Clears RESTRICTED identifiers and
// every profile_identifiers row for this profile — lifecycle state,
// touchpoints, journeys, conversions, and attribution all remain intact
// so historical aggregates (funnel, impact, model performance) stay
// correct. legalHold always blocks, checked here as the final
// authoritative gate regardless of what the review list showed the
// caller a moment earlier.
export async function anonymizeProfile(profileId: string, actorUserId: string, reason: string) {
  const [profile] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error("Profile not found");
  if (profile.legalHold) {
    await db.insert(schema.retentionActions).values({ profileId, action: "PURGE_BLOCKED_LEGAL_HOLD", reason, performedByUserId: actorUserId });
    await recordAuditEvent({
      eventType: "RETENTION_REVIEWED",
      actorUserId,
      targetType: "audience_profile",
      targetId: profileId,
      metadata: { blocked: true, blockReason: "legal_hold" },
    });
    throw new LegalHoldError("Profile has an active legal hold — anonymization is blocked.");
  }

  await db
    .update(schema.audienceProfiles)
    .set({ emailRef: null, phoneRef: null, ksNumberRef: null, displayName: null, retentionClass: "anonymized", updatedAt: new Date() })
    .where(eq(schema.audienceProfiles.id, profileId));

  await db.delete(schema.profileIdentifiers).where(eq(schema.profileIdentifiers.profileId, profileId));

  const [row] = await db
    .insert(schema.retentionActions)
    .values({ profileId, action: "ANONYMIZED", reason, performedByUserId: actorUserId })
    .returning();

  await recordAuditEvent({
    eventType: "PROFILE_ANONYMIZED",
    actorUserId,
    targetType: "audience_profile",
    targetId: profileId,
    metadata: { reason },
  });

  return row!;
}

export async function listRetentionHistory(profileId: string) {
  return db.select().from(schema.retentionActions).where(eq(schema.retentionActions.profileId, profileId)).orderBy(desc(schema.retentionActions.createdAt));
}
