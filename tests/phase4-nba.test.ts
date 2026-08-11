import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { resolveProfile } from "@/lib/commercial-memory/identity";
import { recordTouchpoint } from "@/lib/commercial-memory/touchpoints";
import { applySuppression, recordConsent } from "@/lib/commercial-memory/consent";
import { startJourney, abandonJourney } from "@/lib/journeys/journeys";
import { computeNextBestAction } from "@/lib/next-best-action/engine";
import { evaluateRetargetingEligibility } from "@/lib/next-best-action/retargeting";

async function getOwnerId(): Promise<string> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.role, "OWNER")).limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("No OWNER seeded — run `npm run db:seed` first.");
  return owner.id;
}

async function profileWithLifecycle(state: (typeof schema.lifecycleStateEnum.enumValues)[number]) {
  const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
  await db
    .update(schema.audienceProfiles)
    .set({ lifecycleState: state, eligibleChannels: ["EMAIL"] })
    .where(eq(schema.audienceProfiles.id, profile.id));
  return profile;
}

describe("computeNextBestAction: deterministic per-lifecycle rules", () => {
  it("REGISTERED with no product use -> CREATE_FIRST_PRODUCT", async () => {
    const profile = await profileWithLifecycle("REGISTERED");
    const decision = await computeNextBestAction(profile.id);
    expect(decision.actionType).toBe("CREATE_FIRST_PRODUCT");
    expect(decision.eligibleChannels).toEqual(["EMAIL"]);
  });

  it("an abandoned journey -> RESUME_JOURNEY, regardless of lifecycle state", async () => {
    const profile = await profileWithLifecycle("REGISTERED");
    const journey = await startJourney({ profileId: profile.id, journeyType: "SECURELINK_CREATION", currentStep: "draft_started", isDemo: true });
    await abandonJourney(journey.id, "No activity for 30 hours, exceeding the 24-hour threshold.");

    const decision = await computeNextBestAction(profile.id);
    expect(decision.actionType).toBe("RESUME_JOURNEY");
    expect(decision.reason).toMatch(/SECURELINK_CREATION/);
  });

  it("a suppressed profile -> SUPPRESS with zero eligible channels, no matter what else is true", async () => {
    const ownerId = await getOwnerId();
    const profile = await profileWithLifecycle("HIGH_VALUE");
    await applySuppression({ profileId: profile.id, reason: "OPT_OUT", source: "test" }, ownerId);

    const decision = await computeNextBestAction(profile.id);
    expect(decision.actionType).toBe("SUPPRESS");
    expect(decision.eligibleChannels).toEqual([]);
  });

  it("no eligible channel downgrades an otherwise-actionable decision to NO_ACTION", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await db.update(schema.audienceProfiles).set({ lifecycleState: "REGISTERED", eligibleChannels: [] }).where(eq(schema.audienceProfiles.id, profile.id));

    const decision = await computeNextBestAction(profile.id);
    expect(decision.actionType).toBe("NO_ACTION");
    expect(decision.blockedActions.length).toBeGreaterThan(0);
  });
});

// recordTouchpoint() recomputes lifecycle deterministically from full
// history on every call (src/lib/commercial-memory/lifecycle.ts), so any
// manually-forced lifecycleState must be set AFTER the touchpoints that
// feed the upsell/cross-sell evidence check, not before — otherwise the
// next touchpoint silently recomputes it back down.
async function activeProfileWithTouchpoints(types: Array<(typeof schema.touchpointTypeEnum.enumValues)[number]>) {
  const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
  for (const type of types) {
    await recordTouchpoint({ profileId: profile.id, type, isDemo: true });
  }
  await db.update(schema.audienceProfiles).set({ lifecycleState: "ACTIVE", eligibleChannels: ["EMAIL"] }).where(eq(schema.audienceProfiles.id, profile.id));
  return profile;
}

describe("computeNextBestAction: upsell/cross-sell requires actual observed evidence", () => {
  it("ACTIVE user with repeated SecureLink use and no KeyContract -> UPSELL(KeyContract)", async () => {
    const profile = await activeProfileWithTouchpoints(["SECURELINK_CREATED", "SECURELINK_CREATED"]);
    const decision = await computeNextBestAction(profile.id);
    expect(decision.actionType).toBe("UPSELL");
    expect(decision.relatedProduct).toBe("KeyContract");
  });

  it("ACTIVE user with no repeat-use evidence -> NO_ACTION, upsell explicitly rejected in blockedActions", async () => {
    const profile = await profileWithLifecycle("ACTIVE");
    const decision = await computeNextBestAction(profile.id);
    expect(decision.actionType).toBe("NO_ACTION");
    expect(decision.blockedActions.some((b) => /UPSELL\/CROSS_SELL/.test(b))).toBe(true);
  });

  it("a single SecureLink (below the repeat threshold) does not qualify for upsell", async () => {
    const profile = await activeProfileWithTouchpoints(["SECURELINK_CREATED"]);
    const decision = await computeNextBestAction(profile.id);
    expect(decision.actionType).not.toBe("UPSELL");
  });

  it("Group SecureLink use with no SecureFlow yet -> CROSS_SELL(SecureFlow)", async () => {
    const profile = await activeProfileWithTouchpoints(["GROUP_SECURELINK_CREATED"]);
    const decision = await computeNextBestAction(profile.id);
    expect(decision.actionType).toBe("CROSS_SELL");
    expect(decision.relatedProduct).toBe("SecureFlow");
  });
});

describe("retargeting eligibility", () => {
  it("a profile with no interaction history is NOT_ELIGIBLE", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    const decision = await evaluateRetargetingEligibility({ profileId: profile.id });
    expect(decision.eligibility).toBe("NOT_ELIGIBLE");
  });

  it("a profile with a recent touch and granted consent is ELIGIBLE", async () => {
    const ownerId = await getOwnerId();
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await recordTouchpoint({ profileId: profile.id, type: "LANDING_PAGE_VIEW", isDemo: true });
    await recordConsent({ profileId: profile.id, status: "GRANTED", source: "test" }, ownerId);
    const decision = await evaluateRetargetingEligibility({ profileId: profile.id });
    expect(decision.eligibility).toBe("ELIGIBLE");
  });

  it("a profile with no recorded consent decision returns NEEDS_REVIEW, not a silent ELIGIBLE — membership is never assumed consent", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await recordTouchpoint({ profileId: profile.id, type: "LANDING_PAGE_VIEW", isDemo: true });
    const decision = await evaluateRetargetingEligibility({ profileId: profile.id });
    expect(decision.eligibility).toBe("NEEDS_REVIEW");
  });

  it("requesting a channel outside the profile's known eligible channels returns NEEDS_REVIEW", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await recordTouchpoint({ profileId: profile.id, type: "LANDING_PAGE_VIEW", isDemo: true });
    await db.update(schema.audienceProfiles).set({ eligibleChannels: ["GOOGLE_SEARCH"] }).where(eq(schema.audienceProfiles.id, profile.id));

    const decision = await evaluateRetargetingEligibility({ profileId: profile.id, channel: "WHATSAPP" });
    expect(decision.eligibility).toBe("NEEDS_REVIEW");
  });

  it("the frequency cap blocks eligibility once the outreach-touch cap is reached", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await recordTouchpoint({ profileId: profile.id, type: "LANDING_PAGE_VIEW", isDemo: true });
    for (let i = 0; i < 3; i++) {
      await recordTouchpoint({ profileId: profile.id, type: "OUTREACH_SENT", isDemo: true });
    }
    const decision = await evaluateRetargetingEligibility({ profileId: profile.id });
    expect(decision.eligibility).toBe("NOT_ELIGIBLE");
    expect(decision.reason).toMatch(/[Ff]requency/);
  });
});
