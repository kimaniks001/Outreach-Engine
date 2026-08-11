import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

// Deterministic identity resolution — Section 10 of the Phase 4 brief.
// Rules: deterministic matching first, no speculative fuzzy personal
// matching, never merge on name similarity, preserve merge/link evidence,
// all merges/links auditable, manual unlink supported. "If uncertain: KEEP
// SEPARATE" — this module only ever merges on an EXACT identifier
// collision (same hashed email, same KSNumber, same session token, ...)
// across two already-known profiles; it never infers a match from
// similarity.

export type IdentifierType = (typeof schema.identifierTypeEnum.enumValues)[number];
export type ProfileType = (typeof schema.profileTypeEnum.enumValues)[number];

// Not a security control (no secret pepper) — this is a deterministic
// reference construct so the same email/phone always resolves to the same
// profile without ever storing the raw value. See
// docs/PHASE_4_PRIVACY_CONSENT_RETENTION.md.
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export interface IdentifierInput {
  ksNumber?: string;
  email?: string;
  phone?: string;
  sessionToken?: string;
  campaignClickRef?: string;
  partnerRef?: string;
}

interface CandidateIdentifier {
  type: IdentifierType;
  value: string;
}

function candidatesFrom(input: IdentifierInput): CandidateIdentifier[] {
  const candidates: CandidateIdentifier[] = [];
  if (input.ksNumber) candidates.push({ type: "KSNUMBER", value: input.ksNumber.trim() });
  if (input.email) candidates.push({ type: "EMAIL_REF", value: hashIdentifier(normalizeEmail(input.email)) });
  if (input.phone) candidates.push({ type: "PHONE_REF", value: hashIdentifier(normalizePhone(input.phone)) });
  if (input.sessionToken) candidates.push({ type: "SESSION_TOKEN", value: input.sessionToken.trim() });
  if (input.campaignClickRef)
    candidates.push({ type: "CAMPAIGN_CLICK_REF", value: input.campaignClickRef.trim() });
  if (input.partnerRef) candidates.push({ type: "PARTNER_REF", value: input.partnerRef.trim() });
  return candidates;
}

// Priority order used only to pick the initial profileType when creating a
// brand-new profile — never used to decide whether two profiles match.
function desiredProfileType(input: IdentifierInput): ProfileType {
  if (input.ksNumber) return "KSNUMBER";
  if (input.email || input.phone) return "PERSON";
  if (input.partnerRef) return "PARTNER";
  return "ANONYMOUS";
}

// Type can only be upgraded from the weakest state (ANONYMOUS) once a
// stronger identifier is known — never silently downgraded or overwritten
// once known, so a later anonymous-looking event can't erase a resolved
// identity.
function upgradedProfileType(existing: ProfileType, desired: ProfileType): ProfileType {
  return existing === "ANONYMOUS" && desired !== "ANONYMOUS" ? desired : existing;
}

export async function resolveCanonicalProfileId(profileId: string): Promise<string> {
  let currentId = profileId;
  for (let i = 0; i < 10; i++) {
    const [row] = await db
      .select({ mergedIntoProfileId: schema.audienceProfiles.mergedIntoProfileId })
      .from(schema.audienceProfiles)
      .where(eq(schema.audienceProfiles.id, currentId))
      .limit(1);
    if (!row || !row.mergedIntoProfileId) return currentId;
    currentId = row.mergedIntoProfileId;
  }
  return currentId;
}

async function findOwningProfile(type: IdentifierType, value: string): Promise<string | null> {
  const [row] = await db
    .select({ profileId: schema.profileIdentifiers.profileId })
    .from(schema.profileIdentifiers)
    .where(and(eq(schema.profileIdentifiers.identifierType, type), eq(schema.profileIdentifiers.identifierValue, value)))
    .limit(1);
  if (!row) return null;
  return resolveCanonicalProfileId(row.profileId);
}

async function attachIdentifier(profileId: string, type: IdentifierType, value: string, source: string) {
  await db
    .insert(schema.profileIdentifiers)
    .values({ profileId, identifierType: type, identifierValue: value, source })
    .onConflictDoNothing({
      target: [schema.profileIdentifiers.identifierType, schema.profileIdentifiers.identifierValue],
    });
}

export interface ResolveProfileInput {
  existingProfileId?: string;
  identifiers: IdentifierInput;
  displayName?: string | null;
  organizationId?: string | null;
  source: string;
  isDemo?: boolean;
}

// The single entry point product-event ingestion and touchpoint recording
// use to resolve "who is this" without ever destroying prior anonymous
// history. Returns the canonical profile — creating one only when no
// identifier resolves and no existingProfileId was given.
export async function resolveProfile(input: ResolveProfileInput): Promise<typeof schema.audienceProfiles.$inferSelect> {
  const candidates = candidatesFrom(input.identifiers);

  let canonicalId: string | null = input.existingProfileId
    ? await resolveCanonicalProfileId(input.existingProfileId)
    : null;

  const foundIds = new Set<string>();
  if (canonicalId) foundIds.add(canonicalId);
  for (const candidate of candidates) {
    const owner = await findOwningProfile(candidate.type, candidate.value);
    if (owner) foundIds.add(owner);
  }

  if (foundIds.size === 0) {
    if (candidates.length === 0 && !input.existingProfileId) {
      throw new Error(
        "resolveProfile requires at least one identifier or an existingProfileId — cannot create an unaddressable profile."
      );
    }
    const [created] = await db
      .insert(schema.audienceProfiles)
      .values({
        profileType: desiredProfileType(input.identifiers),
        displayName: input.displayName ?? null,
        organizationId: input.organizationId ?? null,
        ksNumberRef: input.identifiers.ksNumber ?? null,
        source: input.source,
        isDemo: input.isDemo ?? false,
      })
      .returning();
    for (const candidate of candidates) {
      await attachIdentifier(created!.id, candidate.type, candidate.value, input.source);
    }
    await recordAuditEvent({
      eventType: "PROFILE_CREATED",
      targetType: "audience_profile",
      targetId: created!.id,
      metadata: { profileType: created!.profileType, source: input.source, isDemo: created!.isDemo },
    });
    return created!;
  }

  const ids = [...foundIds];
  let canonical = ids[0]!;
  if (ids.length > 1) {
    canonical = await mergeProfiles(ids, input.source);
  }

  const [existing] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, canonical)).limit(1);
  if (!existing) throw new Error("Canonical profile disappeared during resolution — this should not happen.");

  for (const candidate of candidates) {
    await attachIdentifier(canonical, candidate.type, candidate.value, input.source);
  }

  const nextType = upgradedProfileType(existing.profileType, desiredProfileType(input.identifiers));
  const [updated] = await db
    .update(schema.audienceProfiles)
    .set({
      profileType: nextType,
      displayName: input.displayName ?? existing.displayName,
      organizationId: input.organizationId ?? existing.organizationId,
      ksNumberRef: input.identifiers.ksNumber ?? existing.ksNumberRef,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.audienceProfiles.id, canonical))
    .returning();

  return updated!;
}

// Deterministic merge: the profile with the earliest firstSeenAt survives
// as canonical; the rest are marked mergedIntoProfileId (never deleted —
// their touchpoint/journey/event history stays queryable by resolving
// through the canonical chain). Every merge is recorded in profile_links
// with the identifier evidence that triggered it.
async function mergeProfiles(profileIds: string[], evidenceSource: string): Promise<string> {
  const rows = await db.select().from(schema.audienceProfiles).where(inArray(schema.audienceProfiles.id, profileIds));
  if (rows.length === 0) throw new Error("mergeProfiles called with no resolvable profiles.");

  const canonical = rows.reduce((oldest, row) => (row.firstSeenAt < oldest.firstSeenAt ? row : oldest));
  const others = rows.filter((r) => r.id !== canonical.id);

  for (const other of others) {
    if (other.mergedIntoProfileId === canonical.id) continue;
    await db
      .update(schema.audienceProfiles)
      .set({ mergedIntoProfileId: canonical.id, updatedAt: new Date() })
      .where(eq(schema.audienceProfiles.id, other.id));

    await db.insert(schema.profileLinks).values({
      fromProfileId: other.id,
      toProfileId: canonical.id,
      action: "MERGE",
      reason: `Deterministic exact-identifier collision resolved during ${evidenceSource} ingestion.`,
      evidence: { source: evidenceSource },
    });

    await recordAuditEvent({
      eventType: "PROFILE_MERGED",
      targetType: "audience_profile",
      targetId: other.id,
      metadata: { mergedIntoProfileId: canonical.id, source: evidenceSource },
    });
  }

  return canonical.id;
}

// Manual correction — Owner-only (enforced by the caller), reverses a
// MERGE by clearing mergedIntoProfileId. Does not un-attach identifiers
// (those stay with whichever profile owns them — an operator who unlinks
// incorrectly-merged profiles typically re-points specific identifiers
// separately, which is out of scope for a Phase 4 correction tool).
export async function unlinkProfile(profileId: string, actorUserId: string, reason: string) {
  const [profile] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error("Profile not found");
  if (!profile.mergedIntoProfileId) throw new Error("Profile is not currently merged into another profile.");

  const toProfileId = profile.mergedIntoProfileId;

  await db
    .update(schema.audienceProfiles)
    .set({ mergedIntoProfileId: null, updatedAt: new Date() })
    .where(eq(schema.audienceProfiles.id, profileId));

  await db.insert(schema.profileLinks).values({
    fromProfileId: profileId,
    toProfileId,
    action: "UNLINK",
    reason,
    evidence: {},
    performedByUserId: actorUserId,
  });

  await recordAuditEvent({
    eventType: "PROFILE_UNLINKED",
    actorUserId,
    targetType: "audience_profile",
    targetId: profileId,
    metadata: { previouslyMergedInto: toProfileId, reason },
  });
}
