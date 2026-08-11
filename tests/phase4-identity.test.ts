import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { resolveProfile, unlinkProfile, resolveCanonicalProfileId } from "@/lib/commercial-memory/identity";

// Deterministic identity resolution — Phase 4 brief Section 10. Integration
// tests against a real Postgres instance, same convention as
// tests/phase3-db.test.ts.

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

describe("resolveProfile: deterministic matching", () => {
  it("creates a new profile for a never-seen identifier", async () => {
    const email = `${randomUUID()}@example.com`;
    const profile = await resolveProfile({ identifiers: { email }, source: "test", isDemo: true });
    expect(profile.profileType).toBe("PERSON");
  });

  it("resolves the exact same identifier to the same profile every time", async () => {
    const email = `${randomUUID()}@example.com`;
    const first = await resolveProfile({ identifiers: { email }, source: "test", isDemo: true });
    const second = await resolveProfile({ identifiers: { email }, source: "test", isDemo: true });
    expect(second.id).toBe(first.id);
  });

  it("uncertain/unrelated identifiers never merge — two different emails stay two different profiles", async () => {
    const a = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    const b = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    expect(a.id).not.toBe(b.id);
  });

  it("throws rather than creating an unaddressable profile with zero identifiers", async () => {
    await expect(resolveProfile({ identifiers: {}, source: "test", isDemo: true })).rejects.toThrow();
  });
});

describe("resolveProfile: deterministic merge on exact-identifier collision", () => {
  it("merges two profiles into the earlier-created one when a shared identifier is discovered, preserving both identifiers and auditing the merge", async () => {
    const sessionToken = randomUUID();
    const email = `${randomUUID()}@example.com`;

    const older = await resolveProfile({ identifiers: { sessionToken }, source: "test", isDemo: true });
    const newer = await resolveProfile({ identifiers: { email }, source: "test", isDemo: true });
    expect(older.id).not.toBe(newer.id);

    // A later event resolves the newer profile AND attaches the older
    // profile's sessionToken — the collision that triggers a merge.
    const merged = await resolveProfile({
      existingProfileId: newer.id,
      identifiers: { sessionToken },
      source: "test",
      isDemo: true,
    });

    // Canonical = the earlier-created (older) profile — prior anonymous
    // history is never destroyed, just re-pointed.
    expect(merged.id).toBe(older.id);

    const canonicalOfNewer = await resolveCanonicalProfileId(newer.id);
    expect(canonicalOfNewer).toBe(older.id);

    const [newerRow] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, newer.id)).limit(1);
    expect(newerRow?.mergedIntoProfileId).toBe(older.id);

    const links = await db
      .select()
      .from(schema.profileLinks)
      .where(or(eq(schema.profileLinks.fromProfileId, newer.id), eq(schema.profileLinks.toProfileId, newer.id)));
    expect(links.some((l) => l.action === "MERGE" && l.fromProfileId === newer.id && l.toProfileId === older.id)).toBe(true);

    // Both original identifiers now resolve to the same canonical profile.
    const bySessionToken = await resolveProfile({ identifiers: { sessionToken }, source: "test", isDemo: true });
    const byEmail = await resolveProfile({ identifiers: { email }, source: "test", isDemo: true });
    expect(bySessionToken.id).toBe(older.id);
    expect(byEmail.id).toBe(older.id);
  });

  it("never upgrades an already-known profileType based on a later ANONYMOUS-shaped event", async () => {
    const email = `${randomUUID()}@example.com`;
    const sessionToken = randomUUID();
    const known = await resolveProfile({ identifiers: { email }, source: "test", isDemo: true });
    expect(known.profileType).toBe("PERSON");

    const stillKnown = await resolveProfile({
      existingProfileId: known.id,
      identifiers: { sessionToken },
      source: "test",
      isDemo: true,
    });
    expect(stillKnown.profileType).toBe("PERSON");
  });
});

describe("unlinkProfile: manual Owner correction", () => {
  it("reverses a merge and is audited", async () => {
    const ownerId = await getOwnerId();
    const sessionToken = randomUUID();
    const email = `${randomUUID()}@example.com`;

    const older = await resolveProfile({ identifiers: { sessionToken }, source: "test", isDemo: true });
    const newer = await resolveProfile({ identifiers: { email }, source: "test", isDemo: true });
    await resolveProfile({ existingProfileId: newer.id, identifiers: { sessionToken }, source: "test", isDemo: true });

    const [beforeUnlink] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, newer.id)).limit(1);
    expect(beforeUnlink?.mergedIntoProfileId).toBe(older.id);

    await unlinkProfile(newer.id, ownerId, "Test: incorrect merge, correcting manually.");

    const [afterUnlink] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, newer.id)).limit(1);
    expect(afterUnlink?.mergedIntoProfileId).toBeNull();

    const links = await db.select().from(schema.profileLinks).where(eq(schema.profileLinks.fromProfileId, newer.id));
    expect(links.some((l) => l.action === "UNLINK")).toBe(true);
  });

  it("rejects unlinking a profile that is not currently merged", async () => {
    const ownerId = await getOwnerId();
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await expect(unlinkProfile(profile.id, ownerId, "not merged")).rejects.toThrow();
  });
});
