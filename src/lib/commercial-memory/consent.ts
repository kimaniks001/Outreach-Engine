import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

// Centralized communication eligibility policy — Phase 4 brief Section 21.
// Membership, registration, or product use is NEVER itself a consent
// event: no code path in this module writes a consent_records row as a
// side effect of any other action. Suppression overrides next-best-action,
// retargeting, and outreach planning everywhere those are computed — see
// src/lib/next-best-action/engine.ts and src/lib/next-best-action/retargeting.ts.

export type ConsentStatus = (typeof schema.consentStatusEnum.enumValues)[number];
export type Channel = (typeof schema.channelTypeEnum.enumValues)[number];
export type SuppressionReason = (typeof schema.suppressionReasonEnum.enumValues)[number];

export interface RecordConsentInput {
  profileId: string;
  channel?: Channel | null;
  status: ConsentStatus;
  legalBasis?: string | null;
  source: string;
  expiresAt?: Date | null;
  notes?: string | null;
}

export async function recordConsent(input: RecordConsentInput, actorUserId: string) {
  const [row] = await db
    .insert(schema.consentRecords)
    .values({
      profileId: input.profileId,
      channel: input.channel ?? null,
      status: input.status,
      legalBasis: input.legalBasis ?? null,
      source: input.source,
      recordedByUserId: actorUserId,
      expiresAt: input.expiresAt ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  await recordAuditEvent({
    eventType: "CONSENT_UPDATED",
    actorUserId,
    targetType: "audience_profile",
    targetId: input.profileId,
    metadata: { channel: input.channel ?? "general", status: input.status, source: input.source },
  });

  return row!;
}

// Current effective consent per (profileId, channel) is the latest row —
// a null channel row is general marketing consent, checked as a fallback
// when no channel-specific row exists.
export async function getEffectiveConsent(profileId: string, channel?: Channel | null): Promise<ConsentStatus> {
  const rows = await db
    .select()
    .from(schema.consentRecords)
    .where(eq(schema.consentRecords.profileId, profileId))
    .orderBy(desc(schema.consentRecords.recordedAt));

  const now = new Date();
  const notExpired = rows.filter((r) => !r.expiresAt || r.expiresAt > now);

  const channelSpecific = channel ? notExpired.find((r) => r.channel === channel) : undefined;
  if (channelSpecific) return channelSpecific.status;

  const general = notExpired.find((r) => r.channel === null);
  return general?.status ?? "UNKNOWN";
}

export interface ApplySuppressionInput {
  profileId: string;
  reason: SuppressionReason;
  source: string;
  reviewDate?: Date | null;
  notes?: string | null;
}

export async function applySuppression(input: ApplySuppressionInput, actorUserId: string | null) {
  const [row] = await db
    .insert(schema.suppressionRecords)
    .values({
      profileId: input.profileId,
      action: "APPLIED",
      reason: input.reason,
      source: input.source,
      actorUserId: actorUserId ?? null,
      reviewDate: input.reviewDate ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  await recordAuditEvent({
    eventType: "SUPPRESSION_APPLIED",
    actorUserId: actorUserId ?? undefined,
    targetType: "audience_profile",
    targetId: input.profileId,
    metadata: { reason: input.reason, source: input.source },
  });

  return row!;
}

export async function removeSuppression(profileId: string, actorUserId: string, notes?: string) {
  const [row] = await db
    .insert(schema.suppressionRecords)
    .values({
      profileId,
      action: "REMOVED",
      source: "manual",
      actorUserId,
      notes: notes ?? null,
    })
    .returning();

  await recordAuditEvent({
    eventType: "SUPPRESSION_REMOVED",
    actorUserId,
    targetType: "audience_profile",
    targetId: profileId,
    metadata: { notes: notes ?? null },
  });

  return row!;
}

export async function isSuppressed(profileId: string): Promise<boolean> {
  const [latest] = await db
    .select({ action: schema.suppressionRecords.action })
    .from(schema.suppressionRecords)
    .where(eq(schema.suppressionRecords.profileId, profileId))
    .orderBy(desc(schema.suppressionRecords.createdAt))
    .limit(1);
  return latest?.action === "APPLIED";
}

export async function getSuppressionHistory(profileId: string) {
  return db
    .select()
    .from(schema.suppressionRecords)
    .where(eq(schema.suppressionRecords.profileId, profileId))
    .orderBy(desc(schema.suppressionRecords.createdAt));
}

export async function getConsentHistory(profileId: string) {
  return db
    .select()
    .from(schema.consentRecords)
    .where(eq(schema.consentRecords.profileId, profileId))
    .orderBy(desc(schema.consentRecords.recordedAt));
}
