import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { computeAttributionWeights, type AttributableTouch } from "@/lib/attribution/engine";
import { resolveProfile } from "@/lib/commercial-memory/identity";
import { recordTouchpoint } from "@/lib/commercial-memory/touchpoints";
import { recordConversionEvent, getAttributionForConversion } from "@/lib/attribution/conversions";

function touch(id: string, minutesAgo: number, campaignId: string | null = null): AttributableTouch {
  return { id, campaignId, distributionPlanId: null, channel: "GOOGLE_SEARCH", occurredAt: new Date(Date.now() - minutesAgo * 60 * 1000) };
}

describe("computeAttributionWeights: pure, deterministic", () => {
  it("single touch gets 100% under every model", () => {
    const weights = computeAttributionWeights([touch("a", 10)]);
    for (const model of ["FIRST_TOUCH", "LAST_TOUCH", "LINEAR", "MULTI_TOUCH"] as const) {
      const w = weights.filter((x) => x.attributionModel === model);
      expect(w).toHaveLength(1);
      expect(w[0]!.weight).toBe(1);
    }
  });

  it("FIRST_TOUCH credits only the earliest touch; LAST_TOUCH only the most recent", () => {
    const touches = [touch("a", 30), touch("b", 20), touch("c", 10)];
    const weights = computeAttributionWeights(touches);

    const first = weights.filter((w) => w.attributionModel === "FIRST_TOUCH");
    expect(first).toHaveLength(1);
    expect(first[0]!.touchpointId).toBe("a");

    const last = weights.filter((w) => w.attributionModel === "LAST_TOUCH");
    expect(last).toHaveLength(1);
    expect(last[0]!.touchpointId).toBe("c");
  });

  it("LINEAR splits credit equally and sums to 1", () => {
    const touches = [touch("a", 30), touch("b", 20), touch("c", 10)];
    const weights = computeAttributionWeights(touches).filter((w) => w.attributionModel === "LINEAR");
    expect(weights).toHaveLength(3);
    expect(weights.every((w) => Math.abs(w.weight - 1 / 3) < 0.0001)).toBe(true);
    expect(weights.reduce((sum, w) => sum + w.weight, 0)).toBeCloseTo(1, 3);
  });

  it("MULTI_TOUCH (position-based) sums to 1 and weights the first/last touch highest for 3+ touches", () => {
    const touches = [touch("a", 40), touch("b", 30), touch("c", 20), touch("d", 10)];
    const weights = computeAttributionWeights(touches).filter((w) => w.attributionModel === "MULTI_TOUCH");
    expect(weights.reduce((sum, w) => sum + w.weight, 0)).toBeCloseTo(1, 4);
    const first = weights.find((w) => w.touchpointId === "a")!;
    const middle = weights.find((w) => w.touchpointId === "b")!;
    expect(first.weight).toBeGreaterThan(middle.weight);
  });

  it("is reproducible: identical input always produces identical output", () => {
    const touches = [touch("a", 30), touch("b", 20), touch("c", 10)];
    const first = computeAttributionWeights(touches);
    const second = computeAttributionWeights(touches);
    expect(first).toEqual(second);
  });

  it("returns nothing for zero touches (organic/direct conversion)", () => {
    expect(computeAttributionWeights([])).toEqual([]);
  });
});

describe("recordConversionEvent: multi-touch history preserved, weights stored per model", () => {
  it("preserves every eligible touch across all four attribution models", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await recordTouchpoint({ profileId: profile.id, type: "AD_IMPRESSION", channel: "GOOGLE_SEARCH", isDemo: true });
    await recordTouchpoint({ profileId: profile.id, type: "LANDING_PAGE_VIEW", channel: "GOOGLE_SEARCH", isDemo: true });
    await recordTouchpoint({ profileId: profile.id, type: "FORM_SUBMITTED", channel: "GOOGLE_SEARCH", isDemo: true });

    const { conversion, attributionRecordCount } = await recordConversionEvent({
      profileId: profile.id,
      conversionType: "AGREEMENT_COMPLETED",
      occurredAt: new Date(),
      isDemo: true,
    });

    // FIRST_TOUCH (1 row, earliest only) + LAST_TOUCH (1 row, latest only)
    // + LINEAR (3 rows, one per touch) + MULTI_TOUCH (3 rows) = 8.
    expect(attributionRecordCount).toBe(8);
    const records = await getAttributionForConversion(conversion.id);
    expect(records).toHaveLength(8);
    expect(new Set(records.map((r) => r.attributionModel)).size).toBe(4);
    expect(new Set(records.filter((r) => r.attributionModel === "LINEAR").map((r) => r.touchpointId)).size).toBe(3);
  });

  it("first-only conversion types (e.g. FIRST_SECURELINK) are never duplicated per profile", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    const first = await recordConversionEvent({ profileId: profile.id, conversionType: "FIRST_SECURELINK", occurredAt: new Date(), isDemo: true });
    expect(first.skippedAsDuplicateFirst).toBe(false);

    const second = await recordConversionEvent({ profileId: profile.id, conversionType: "FIRST_SECURELINK", occurredAt: new Date(), isDemo: true });
    expect(second.skippedAsDuplicateFirst).toBe(true);
    expect(second.conversion.id).toBe(first.conversion.id);

    const rows = await db.select().from(schema.conversionEvents).where(eq(schema.conversionEvents.profileId, profile.id));
    expect(rows.filter((r) => r.conversionType === "FIRST_SECURELINK")).toHaveLength(1);
  });

  it("REPEAT_USE is not first-only — repeated conversions are each recorded", async () => {
    const profile = await resolveProfile({ identifiers: { email: `${randomUUID()}@example.com` }, source: "test", isDemo: true });
    await recordConversionEvent({ profileId: profile.id, conversionType: "REPEAT_USE", occurredAt: new Date(), isDemo: true });
    await recordConversionEvent({ profileId: profile.id, conversionType: "REPEAT_USE", occurredAt: new Date(), isDemo: true });

    const rows = await db.select().from(schema.conversionEvents).where(eq(schema.conversionEvents.profileId, profile.id));
    expect(rows.filter((r) => r.conversionType === "REPEAT_USE")).toHaveLength(2);
  });
});
