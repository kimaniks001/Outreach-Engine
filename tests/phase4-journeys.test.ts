import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProfile } from "@/lib/commercial-memory/identity";
import { startJourney, getJourney, advanceJourney, completeJourney, abandonJourney } from "@/lib/journeys/journeys";
import { isPastAbandonmentThreshold, forceCheckJourney, ABANDONMENT_THRESHOLD_MINUTES } from "@/lib/journeys/abandonment";

async function newProfile() {
  return resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
}

describe("journey lifecycle", () => {
  it("moves STARTED -> IN_PROGRESS -> COMPLETED", async () => {
    const profile = await newProfile();
    const journey = await startJourney({ profileId: profile.id, journeyType: "SECURELINK_CREATION", currentStep: "draft_started", isDemo: true });
    expect(journey.status).toBe("STARTED");

    const advanced = await advanceJourney(journey.id, "draft_reviewed");
    expect(advanced?.status).toBe("IN_PROGRESS");

    const completed = await completeJourney(journey.id);
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.completedAt).not.toBeNull();
  });

  it("abandonJourney records a reason and sets status ABANDONED", async () => {
    const profile = await newProfile();
    const journey = await startJourney({ profileId: profile.id, journeyType: "DEMO", currentStep: "started", isDemo: true });
    const abandoned = await abandonJourney(journey.id, "No activity for 3 hours.");
    expect(abandoned?.status).toBe("ABANDONED");
    expect(abandoned?.abandonmentReason).toMatch(/No activity/);
  });
});

describe("abandonment detection: threshold-based, never instant", () => {
  it("a journey with recent activity is NOT past its threshold", () => {
    expect(isPastAbandonmentThreshold("SECURELINK_CREATION", new Date())).toBe(false);
  });

  it("a journey older than its type's threshold IS past its threshold", () => {
    const longAgo = new Date(Date.now() - (ABANDONMENT_THRESHOLD_MINUTES.SECURELINK_CREATION + 60) * 60 * 1000);
    expect(isPastAbandonmentThreshold("SECURELINK_CREATION", longAgo)).toBe(true);
  });

  it("DEMO has a much shorter threshold than BUSINESS_ONBOARDING", () => {
    expect(ABANDONMENT_THRESHOLD_MINUTES.DEMO).toBeLessThan(ABANDONMENT_THRESHOLD_MINUTES.BUSINESS_ONBOARDING);
  });

  it("forceCheckJourney does not abandon a fresh journey", async () => {
    const profile = await newProfile();
    const journey = await startJourney({ profileId: profile.id, journeyType: "SECURELINK_CREATION", currentStep: "draft_started", isDemo: true });
    const result = await forceCheckJourney(journey.id);
    expect(result?.status).toBe("STARTED");
  });

  it("forceCheckJourney abandons a journey once its threshold has passed (simulated via a shifted 'now')", async () => {
    const profile = await newProfile();
    const journey = await startJourney({ profileId: profile.id, journeyType: "SECURELINK_CREATION", currentStep: "draft_started", isDemo: true });
    const future = new Date(Date.now() + (ABANDONMENT_THRESHOLD_MINUTES.SECURELINK_CREATION + 60) * 60 * 1000);
    const result = await forceCheckJourney(journey.id, future);
    expect(result?.status).toBe("ABANDONED");
  });

  it("does not resurrect an already-completed journey", async () => {
    const profile = await newProfile();
    const journey = await startJourney({ profileId: profile.id, journeyType: "SECURELINK_CREATION", currentStep: "draft_started", isDemo: true });
    await completeJourney(journey.id);
    const future = new Date(Date.now() + (ABANDONMENT_THRESHOLD_MINUTES.SECURELINK_CREATION + 60) * 60 * 1000);
    const result = await forceCheckJourney(journey.id, future);
    expect(result?.status).toBe("COMPLETED");
  });

  it("getJourney returns null for an unknown id", async () => {
    expect(await getJourney(randomUUID())).toBeNull();
  });
});
