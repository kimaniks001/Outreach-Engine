import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { resolveProfile } from "@/lib/commercial-memory/identity";
import {
  applySuppression,
  removeSuppression,
  isSuppressed,
  getEffectiveConsent,
  recordConsent,
} from "@/lib/commercial-memory/consent";
import { evaluateRetargetingEligibility } from "@/lib/next-best-action/retargeting";

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

async function newProfile() {
  return resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
}

describe("consent: registration/product use is never itself marketing consent", () => {
  it("a freshly created profile has UNKNOWN consent — no implicit grant", async () => {
    const profile = await newProfile();
    expect(await getEffectiveConsent(profile.id)).toBe("UNKNOWN");
  });

  it("channel-specific consent does not leak to a different channel", async () => {
    const ownerId = await getOwnerId();
    const profile = await newProfile();
    await recordConsent({ profileId: profile.id, channel: "EMAIL", status: "GRANTED", source: "test" }, ownerId);

    expect(await getEffectiveConsent(profile.id, "EMAIL")).toBe("GRANTED");
    expect(await getEffectiveConsent(profile.id, "WHATSAPP")).toBe("UNKNOWN");
    expect(await getEffectiveConsent(profile.id)).toBe("UNKNOWN"); // no general row
  });

  it("the latest consent record for a channel is authoritative (withdrawal overrides an earlier grant)", async () => {
    const ownerId = await getOwnerId();
    const profile = await newProfile();
    await recordConsent({ profileId: profile.id, channel: "EMAIL", status: "GRANTED", source: "test" }, ownerId);
    await recordConsent({ profileId: profile.id, channel: "EMAIL", status: "WITHDRAWN", source: "test" }, ownerId);
    expect(await getEffectiveConsent(profile.id, "EMAIL")).toBe("WITHDRAWN");
  });
});

describe("suppression: overrides everything, applied/removed is auditable", () => {
  it("a new profile is not suppressed by default", async () => {
    const profile = await newProfile();
    expect(await isSuppressed(profile.id)).toBe(false);
  });

  it("applySuppression then removeSuppression toggles isSuppressed correctly", async () => {
    const ownerId = await getOwnerId();
    const profile = await newProfile();

    await applySuppression({ profileId: profile.id, reason: "OPT_OUT", source: "test" }, ownerId);
    expect(await isSuppressed(profile.id)).toBe(true);

    await removeSuppression(profile.id, ownerId);
    expect(await isSuppressed(profile.id)).toBe(false);
  });

  it("suppression overrides retargeting eligibility even with granted consent and recent interaction", async () => {
    const ownerId = await getOwnerId();
    const profile = await newProfile();
    await recordConsent({ profileId: profile.id, status: "GRANTED", source: "test" }, ownerId);
    await db.insert(schema.touchpoints).values({ profileId: profile.id, type: "LANDING_PAGE_VIEW", isDemo: true });

    const beforeSuppression = await evaluateRetargetingEligibility({ profileId: profile.id });
    expect(beforeSuppression.eligibility).toBe("ELIGIBLE");

    await applySuppression({ profileId: profile.id, reason: "DO_NOT_CONTACT", source: "test" }, ownerId);
    const afterSuppression = await evaluateRetargetingEligibility({ profileId: profile.id });
    expect(afterSuppression.eligibility).toBe("NOT_ELIGIBLE");
    expect(afterSuppression.reason).toMatch(/suppressed/i);
  });
});
