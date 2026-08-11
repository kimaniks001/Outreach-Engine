import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { recomputeLifecycle } from "@/lib/commercial-memory/lifecycle";
import {
  ATTRIBUTABLE_TOUCH_TYPES,
  ATTRIBUTION_ENGINE_VERSION,
  computeAttributionWeights,
} from "./engine";

export type ConversionType = (typeof schema.conversionTypeEnum.enumValues)[number];

// A "first" conversion type can only ever be recorded once per profile —
// repeat activity of the same underlying product is recorded as a
// REPEAT_USE conversion instead (Section 24). KSNUMBER_CREATED is also
// first-only: a profile registers exactly one KSNumber.
const FIRST_ONLY_TYPES: ConversionType[] = [
  "KSNUMBER_CREATED",
  "FIRST_SECURELINK",
  "FIRST_KEYCONTRACT",
  "FIRST_GROUP_SECURELINK",
  "FIRST_SECUREFLOW",
];

export interface RecordConversionInput {
  profileId: string;
  organizationId?: string | null;
  conversionType: ConversionType;
  occurredAt: Date;
  sourceProductEventId?: string | null;
  value?: number | null;
  isDemo?: boolean;
}

export interface RecordConversionResult {
  conversion: typeof schema.conversionEvents.$inferSelect;
  attributionRecordCount: number;
  skippedAsDuplicateFirst: boolean;
}

// Orchestrates conversion creation + attribution calculation — the single
// entry point src/lib/product-events/ingest.ts uses for every conversion
// milestone. Never overwrites prior touch/attribution history; each call
// is additive.
export async function recordConversionEvent(input: RecordConversionInput): Promise<RecordConversionResult> {
  if (FIRST_ONLY_TYPES.includes(input.conversionType)) {
    const [existing] = await db
      .select({ id: schema.conversionEvents.id })
      .from(schema.conversionEvents)
      .where(
        and(
          eq(schema.conversionEvents.profileId, input.profileId),
          eq(schema.conversionEvents.conversionType, input.conversionType)
        )
      )
      .limit(1);
    if (existing) {
      const [row] = await db.select().from(schema.conversionEvents).where(eq(schema.conversionEvents.id, existing.id)).limit(1);
      return { conversion: row!, attributionRecordCount: 0, skippedAsDuplicateFirst: true };
    }
  }

  const [conversion] = await db
    .insert(schema.conversionEvents)
    .values({
      profileId: input.profileId,
      organizationId: input.organizationId ?? null,
      conversionType: input.conversionType,
      occurredAt: input.occurredAt,
      sourceProductEventId: input.sourceProductEventId ?? null,
      value: input.value !== undefined && input.value !== null ? String(input.value) : null,
      isDemo: input.isDemo ?? false,
    })
    .returning();

  await recordAuditEvent({
    eventType: "CONVERSION_RECORDED",
    targetType: "conversion_event",
    targetId: conversion!.id,
    metadata: { profileId: input.profileId, conversionType: input.conversionType },
  });

  const eligibleTouches = await db
    .select()
    .from(schema.touchpoints)
    .where(
      and(
        eq(schema.touchpoints.profileId, input.profileId),
        lte(schema.touchpoints.occurredAt, conversion!.occurredAt),
        inArray(schema.touchpoints.type, ATTRIBUTABLE_TOUCH_TYPES)
      )
    )
    .orderBy(asc(schema.touchpoints.occurredAt));

  const weights = computeAttributionWeights(
    eligibleTouches.map((t) => ({
      id: t.id,
      campaignId: t.campaignId,
      distributionPlanId: t.distributionPlanId,
      channel: t.channel,
      occurredAt: t.occurredAt,
    }))
  );

  if (weights.length > 0) {
    await db.insert(schema.attributionRecords).values(
      weights.map((w) => ({
        conversionEventId: conversion!.id,
        profileId: input.profileId,
        campaignId: w.campaignId,
        distributionPlanId: w.distributionPlanId,
        channel: w.channel as (typeof schema.channelTypeEnum.enumValues)[number] | null,
        touchpointId: w.touchpointId,
        attributionModel: w.attributionModel,
        weight: String(w.weight),
        rationale: w.rationale,
      }))
    );

    await recordAuditEvent({
      eventType: "ATTRIBUTION_CREATED",
      targetType: "conversion_event",
      targetId: conversion!.id,
      metadata: { recordCount: weights.length, touchCount: eligibleTouches.length, engineVersion: ATTRIBUTION_ENGINE_VERSION },
    });
  }

  await recomputeLifecycle(input.profileId);

  return { conversion: conversion!, attributionRecordCount: weights.length, skippedAsDuplicateFirst: false };
}

export async function getAttributionForConversion(conversionEventId: string) {
  return db
    .select()
    .from(schema.attributionRecords)
    .where(eq(schema.attributionRecords.conversionEventId, conversionEventId))
    .orderBy(desc(schema.attributionRecords.createdAt));
}

export interface ListConversionsFilters {
  profileId?: string;
  conversionType?: ConversionType;
}

export async function listConversions(filters: ListConversionsFilters = {}) {
  const conditions = [];
  if (filters.profileId) conditions.push(eq(schema.conversionEvents.profileId, filters.profileId));
  if (filters.conversionType) conditions.push(eq(schema.conversionEvents.conversionType, filters.conversionType));

  return db
    .select()
    .from(schema.conversionEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.conversionEvents.occurredAt));
}
