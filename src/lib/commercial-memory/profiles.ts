import { desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/rbac/roles";
import { recordAuditEvent } from "@/lib/audit/log";

// Unified Audience Profile reads. RESTRICTED-classification fields
// (emailRef/phoneRef/ksNumberRef — docs/DATA_CLASSIFICATION.md Section 2:
// "raw personal contact details, secure identity mappings, private
// identifiers... Access limited to Owner/Super Admin") are stripped from
// every API response for any role other than OWNER, regardless of that
// role's `audience` capability scope — capability grants visibility into
// commercial-memory *conclusions* (lifecycle, touches, journeys), not
// RESTRICTED raw identifiers. See docs/PHASE_4_PRIVACY_CONSENT_RETENTION.md.

export type SanitizedProfile = Omit<
  typeof schema.audienceProfiles.$inferSelect,
  "emailRef" | "phoneRef" | "ksNumberRef"
> & { emailRef?: string | null; phoneRef?: string | null; ksNumberRef?: string | null };

export function sanitizeProfileForRole(
  role: Role,
  profile: typeof schema.audienceProfiles.$inferSelect
): SanitizedProfile {
  if (role === "OWNER") return profile;
  const { emailRef: _emailRef, phoneRef: _phoneRef, ksNumberRef: _ksNumberRef, ...rest } = profile;
  return rest;
}

export async function getProfile(id: string) {
  const rows = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface ListProfilesFilters {
  profileType?: (typeof schema.profileTypeEnum.enumValues)[number];
  lifecycleState?: (typeof schema.lifecycleStateEnum.enumValues)[number];
  organizationId?: string;
  includeMerged?: boolean;
}

export async function listProfiles(filters: ListProfilesFilters = {}) {
  const rows = await db
    .select()
    .from(schema.audienceProfiles)
    .where(filters.includeMerged ? undefined : isNull(schema.audienceProfiles.mergedIntoProfileId))
    .orderBy(desc(schema.audienceProfiles.lastSeenAt));

  return rows.filter((r) => {
    if (filters.profileType && r.profileType !== filters.profileType) return false;
    if (filters.lifecycleState && r.lifecycleState !== filters.lifecycleState) return false;
    if (filters.organizationId && r.organizationId !== filters.organizationId) return false;
    return true;
  });
}

// Manual creation path — e.g. a PARTNER-platform participant onboarded by
// an Owner before any touchpoint/product event exists. Most profiles are
// created automatically via src/lib/commercial-memory/identity.ts::resolveProfile.
export interface CreateManualProfileInput {
  profileType: (typeof schema.profileTypeEnum.enumValues)[number];
  displayName?: string | null;
  organizationId?: string | null;
  eligibleChannels?: string[];
  classification?: (typeof schema.classificationEnum.enumValues)[number];
  isDemo?: boolean;
}

export async function createManualProfile(input: CreateManualProfileInput, actorUserId: string) {
  const [row] = await db
    .insert(schema.audienceProfiles)
    .values({
      profileType: input.profileType,
      displayName: input.displayName ?? null,
      organizationId: input.organizationId ?? null,
      eligibleChannels: input.eligibleChannels ?? [],
      classification: input.classification ?? "CONFIDENTIAL",
      source: "manual",
      isDemo: input.isDemo ?? false,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "PROFILE_CREATED",
    actorUserId,
    targetType: "audience_profile",
    targetId: row!.id,
    metadata: { profileType: row!.profileType, source: "manual" },
  });

  return row!;
}

export async function listProfileIdentifiers(profileId: string) {
  return db
    .select()
    .from(schema.profileIdentifiers)
    .where(eq(schema.profileIdentifiers.profileId, profileId))
    .orderBy(desc(schema.profileIdentifiers.createdAt));
}

export async function listProfileLinks(profileId: string) {
  const rows = await db.select().from(schema.profileLinks).orderBy(desc(schema.profileLinks.createdAt));
  return rows.filter((r) => r.fromProfileId === profileId || r.toProfileId === profileId);
}
