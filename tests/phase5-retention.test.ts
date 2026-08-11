import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { resolveProfile } from "@/lib/commercial-memory/identity";
import { listRetentionReviewCandidates, markReviewed, anonymizeProfile, LegalHoldError } from "@/lib/commercial-memory/retention";

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

describe("retention review: only explicit retentionUntil makes a profile eligible", () => {
  it("a fresh profile with no retentionUntil is never in the review list", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    const candidates = await listRetentionReviewCandidates();
    expect(candidates.some((c) => c.profileId === profile.id)).toBe(false);
  });

  it("a profile with retentionUntil in the past is eligible; markReviewed is audited without anonymizing", async () => {
    const ownerId = await getOwnerId();
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await db.update(schema.audienceProfiles).set({ retentionUntil: new Date(Date.now() - 1000) }).where(eq(schema.audienceProfiles.id, profile.id));

    const candidates = await listRetentionReviewCandidates();
    expect(candidates.some((c) => c.profileId === profile.id)).toBe(true);

    await markReviewed(profile.id, ownerId, "test review");

    const [reloaded] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, profile.id)).limit(1);
    expect(reloaded?.emailRef).not.toBeNull(); // markReviewed never anonymizes

    const auditRows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventType, "RETENTION_REVIEWED"));
    expect(auditRows.some((a) => a.targetId === profile.id)).toBe(true);
  });

  it("a profile with retentionUntil in the future is never eligible", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await db.update(schema.audienceProfiles).set({ retentionUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) }).where(eq(schema.audienceProfiles.id, profile.id));

    const candidates = await listRetentionReviewCandidates();
    expect(candidates.some((c) => c.profileId === profile.id)).toBe(false);
  });
});

describe("anonymization: legal hold always blocks, aggregates preserved, audited", () => {
  it("legalHold blocks anonymization even when retentionUntil has passed", async () => {
    const ownerId = await getOwnerId();
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await db.update(schema.audienceProfiles).set({ retentionUntil: new Date(Date.now() - 1000), legalHold: true }).where(eq(schema.audienceProfiles.id, profile.id));

    await expect(anonymizeProfile(profile.id, ownerId, "attempt")).rejects.toThrow(LegalHoldError);

    const [reloaded] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, profile.id)).limit(1);
    expect(reloaded?.emailRef).not.toBeNull(); // never anonymized

    const blockRows = await db.select().from(schema.retentionActions).where(eq(schema.retentionActions.profileId, profile.id));
    expect(blockRows.some((r) => r.action === "PURGE_BLOCKED_LEGAL_HOLD")).toBe(true);
  });

  it("anonymizing clears RESTRICTED fields and every identifier row, but preserves lifecycle state", async () => {
    const ownerId = await getOwnerId();
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await db.update(schema.audienceProfiles).set({ retentionUntil: new Date(Date.now() - 1000), lifecycleState: "ACTIVE" }).where(eq(schema.audienceProfiles.id, profile.id));

    await anonymizeProfile(profile.id, ownerId, "test anonymize");

    const [reloaded] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, profile.id)).limit(1);
    expect(reloaded?.emailRef).toBeNull();
    expect(reloaded?.displayName).toBeNull();
    expect(reloaded?.retentionClass).toBe("anonymized");
    expect(reloaded?.lifecycleState).toBe("ACTIVE"); // aggregate preserved, never reset

    const identifiers = await db.select().from(schema.profileIdentifiers).where(eq(schema.profileIdentifiers.profileId, profile.id));
    expect(identifiers).toHaveLength(0);

    const auditRows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventType, "PROFILE_ANONYMIZED"));
    expect(auditRows.some((a) => a.targetId === profile.id)).toBe(true);
  });
});
