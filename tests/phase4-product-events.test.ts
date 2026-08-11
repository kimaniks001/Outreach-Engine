import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { ingestProductEvent } from "@/lib/product-events/ingest";

// Product-event ingestion — Phase 4 brief Sections 13/14/38.

describe("ingestProductEvent: validation", () => {
  it("rejects malformed input without mutating anything", async () => {
    const outcome = await ingestProductEvent({ source: "test" }, "test");
    expect(outcome.status).toBe("REJECTED");
  });

  it("rejects a profileRef with zero identifiers", async () => {
    const outcome = await ingestProductEvent(
      {
        source: "test",
        externalEventId: randomUUID(),
        productEventType: "KSNUMBER_CREATED",
        occurredAt: new Date().toISOString(),
        profileRef: {},
      },
      "test"
    );
    expect(outcome.status).toBe("REJECTED");
  });

  it("rejects an unknown productEventType", async () => {
    const outcome = await ingestProductEvent(
      {
        source: "test",
        externalEventId: randomUUID(),
        productEventType: "NOT_A_REAL_EVENT",
        occurredAt: new Date().toISOString(),
        profileRef: { email: `${randomUUID()}@example.com` },
      },
      "test"
    );
    expect(outcome.status).toBe("REJECTED");
  });
});

describe("ingestProductEvent: successful processing", () => {
  it("processes a valid KSNUMBER_CREATED event: creates profile, touchpoint, conversion, and moves lifecycle to REGISTERED", async () => {
    const email = `${randomUUID()}@example.com`;
    const outcome = await ingestProductEvent(
      {
        source: "test",
        externalEventId: randomUUID(),
        productEventType: "KSNUMBER_CREATED",
        occurredAt: new Date().toISOString(),
        profileRef: { email },
      },
      "test"
    );
    expect(outcome.status).toBe("PROCESSED");
    if (outcome.status !== "PROCESSED") throw new Error("unreachable");

    const [profile] = await db.select().from(schema.audienceProfiles).where(eq(schema.audienceProfiles.id, outcome.profileId)).limit(1);
    expect(profile?.lifecycleState).toBe("REGISTERED");

    const [conversion] = await db.select().from(schema.conversionEvents).where(eq(schema.conversionEvents.id, outcome.conversionId!)).limit(1);
    expect(conversion?.conversionType).toBe("KSNUMBER_CREATED");
  });

  it("SECURELINK_DRAFT_STARTED starts a SECURELINK_CREATION journey", async () => {
    const email = `${randomUUID()}@example.com`;
    const outcome = await ingestProductEvent(
      {
        source: "test",
        externalEventId: randomUUID(),
        productEventType: "SECURELINK_DRAFT_STARTED",
        occurredAt: new Date().toISOString(),
        profileRef: { email },
      },
      "test"
    );
    expect(outcome.status).toBe("PROCESSED");
    if (outcome.status !== "PROCESSED") throw new Error("unreachable");
    expect(outcome.journeyId).not.toBeNull();

    const [journey] = await db.select().from(schema.productJourneys).where(eq(schema.productJourneys.id, outcome.journeyId!)).limit(1);
    expect(journey?.journeyType).toBe("SECURELINK_CREATION");
    expect(journey?.status).toBe("STARTED");
  });
});

describe("ingestProductEvent: idempotency", () => {
  it("a duplicate (source, idempotencyKey) never creates a second touchpoint/conversion/journey", async () => {
    const email = `${randomUUID()}@example.com`;
    const externalEventId = randomUUID();
    const payload = {
      source: "test",
      externalEventId,
      productEventType: "KSNUMBER_CREATED" as const,
      occurredAt: new Date().toISOString(),
      profileRef: { email },
    };

    const first = await ingestProductEvent(payload, "test");
    expect(first.status).toBe("PROCESSED");
    if (first.status !== "PROCESSED") throw new Error("unreachable");

    const second = await ingestProductEvent(payload, "test");
    expect(second.status).toBe("DUPLICATE");
    if (second.status !== "DUPLICATE") throw new Error("unreachable");
    expect(second.productEventId).toBe(first.productEventId);

    const touchpoints = await db
      .select()
      .from(schema.touchpoints)
      .where(eq(schema.touchpoints.profileId, first.profileId));
    expect(touchpoints.filter((t) => t.type === "KSNUMBER_CREATED")).toHaveLength(1);

    const conversions = await db
      .select()
      .from(schema.conversionEvents)
      .where(eq(schema.conversionEvents.profileId, first.profileId));
    expect(conversions.filter((c) => c.conversionType === "KSNUMBER_CREATED")).toHaveLength(1);
  });

  it("an explicit idempotencyKey (distinct from source:externalEventId) is honored", async () => {
    const email = `${randomUUID()}@example.com`;
    const idempotencyKey = `custom:${randomUUID()}`;
    const payload = {
      source: "test",
      externalEventId: randomUUID(),
      idempotencyKey,
      productEventType: "KSNUMBER_CREATED" as const,
      occurredAt: new Date().toISOString(),
      profileRef: { email },
    };

    const first = await ingestProductEvent(payload, "test");
    const second = await ingestProductEvent({ ...payload, externalEventId: randomUUID() }, "test");
    expect(first.status).toBe("PROCESSED");
    expect(second.status).toBe("DUPLICATE");
  });
});
