import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { resolveProfile } from "@/lib/commercial-memory/identity";
import { recordTouchpoint, type TouchpointType } from "@/lib/commercial-memory/touchpoints";
import { getOpenJourney, startJourney, advanceJourney, completeJourney, type JourneyType } from "@/lib/journeys/journeys";
import { recordConversionEvent, type ConversionType } from "@/lib/attribution/conversions";
import { recomputeNextBestAction } from "@/lib/next-best-action/engine";
import { productEventIngestSchema, type ProductEventIngestInput } from "./schemas";

// Inbound SecurePay product-event boundary — Phase 4 brief Section 13:
// SECUREPAY → ADAPTER/INGESTION API → VALIDATION → DEDUPLICATION/
// IDEMPOTENCY → PROFILE/JOURNEY UPDATE → ATTRIBUTION → NEXT-BEST-ACTION.
// This is the single orchestration entry point both the authenticated API
// route and the deterministic simulator call — no other code path is
// allowed to create touchpoints/journeys/conversions from a product event.

type ProductEventType = (typeof schema.productEventTypeEnum.enumValues)[number];

const TOUCHPOINT_FOR_EVENT: Record<ProductEventType, TouchpointType> = {
  KSNUMBER_CREATED: "KSNUMBER_CREATED",
  SECURELINK_DRAFT_STARTED: "SECURELINK_STARTED",
  SECURELINK_CREATED: "SECURELINK_CREATED",
  KEYCONTRACT_CREATED: "KEYCONTRACT_CREATED",
  GROUP_SECURELINK_CREATED: "GROUP_SECURELINK_CREATED",
  SECUREFLOW_CREATED: "SECUREFLOW_CREATED",
  PAYMENT_COMMITTED: "PAYMENT_COMMITTED",
  AGREEMENT_COMPLETED: "AGREEMENT_COMPLETED",
  SETTLEMENT_COMPLETED: "SETTLEMENT_COMPLETED",
  PRODUCT_REUSED: "PRODUCT_REUSED",
};

const JOURNEY_FOR_EVENT: Partial<Record<ProductEventType, JourneyType>> = {
  SECURELINK_DRAFT_STARTED: "SECURELINK_CREATION",
  SECURELINK_CREATED: "SECURELINK_CREATION",
  KEYCONTRACT_CREATED: "KEYCONTRACT_CREATION",
  GROUP_SECURELINK_CREATED: "GROUP_SECURELINK_CREATION",
  SECUREFLOW_CREATED: "SECUREFLOW_CREATION",
};

// Product event types whose corresponding touchpoint has already fired
// once for this profile use REPEAT_USE instead of the "first" conversion
// type. PAYMENT_COMMITTED/AGREEMENT_COMPLETED/SETTLEMENT_COMPLETED/
// PRODUCT_REUSED always create a conversion (not first-only) — see
// src/lib/attribution/conversions.ts's FIRST_ONLY_TYPES.
const FIRST_CONVERSION_FOR_EVENT: Partial<Record<ProductEventType, ConversionType>> = {
  KSNUMBER_CREATED: "KSNUMBER_CREATED",
  SECURELINK_CREATED: "FIRST_SECURELINK",
  KEYCONTRACT_CREATED: "FIRST_KEYCONTRACT",
  GROUP_SECURELINK_CREATED: "FIRST_GROUP_SECURELINK",
  SECUREFLOW_CREATED: "FIRST_SECUREFLOW",
};

const ALWAYS_CONVERSION_FOR_EVENT: Partial<Record<ProductEventType, ConversionType>> = {
  PAYMENT_COMMITTED: "PAYMENT_COMMITTED",
  AGREEMENT_COMPLETED: "AGREEMENT_COMPLETED",
  SETTLEMENT_COMPLETED: "SETTLEMENT_COMPLETED",
  PRODUCT_REUSED: "REPEAT_USE",
};

export type IngestOutcome =
  | { status: "REJECTED"; errors: string[] }
  | { status: "DUPLICATE"; productEventId: string }
  | {
      status: "PROCESSED";
      productEventId: string;
      profileId: string;
      touchpointId: string;
      journeyId: string | null;
      conversionId: string | null;
    };

export async function ingestProductEvent(rawInput: unknown, source: string): Promise<IngestOutcome> {
  const parsed = productEventIngestSchema.safeParse(rawInput);
  if (!parsed.success) {
    await recordAuditEvent({
      eventType: "PRODUCT_EVENT_REJECTED",
      targetType: "product_event",
      metadata: { source, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
    });
    return { status: "REJECTED", errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }

  const input: ProductEventIngestInput = parsed.data;
  const idempotencyKey = input.idempotencyKey ?? `${input.source}:${input.externalEventId}`;

  const [existing] = await db
    .select({ id: schema.productEvents.id })
    .from(schema.productEvents)
    .where(and(eq(schema.productEvents.source, input.source), eq(schema.productEvents.idempotencyKey, idempotencyKey)))
    .limit(1);

  if (existing) {
    await recordAuditEvent({
      eventType: "PRODUCT_EVENT_DUPLICATE",
      targetType: "product_event",
      targetId: existing.id,
      metadata: { source: input.source, idempotencyKey },
    });
    return { status: "DUPLICATE", productEventId: existing.id };
  }

  const profile = await resolveProfile({
    existingProfileId: input.profileRef.profileId,
    identifiers: {
      ksNumber: input.profileRef.ksNumber,
      email: input.profileRef.email,
      phone: input.profileRef.phone,
      sessionToken: input.profileRef.sessionToken,
      campaignClickRef: input.profileRef.campaignClickRef,
      partnerRef: input.profileRef.partnerRef,
    },
    organizationId: input.organizationId ?? null,
    source: `product_event:${input.source}`,
    isDemo: input.isDemo,
  });

  const occurredAt = new Date(input.occurredAt);

  const [productEvent] = await db
    .insert(schema.productEvents)
    .values({
      source: input.source,
      externalEventId: input.externalEventId,
      idempotencyKey,
      productEventType: input.productEventType,
      occurredAt,
      schemaVersion: input.schemaVersion,
      profileId: profile.id,
      organizationId: input.organizationId ?? null,
      payload: input.metadata,
      status: "RECEIVED",
    })
    .returning();

  const touchpointType = TOUCHPOINT_FOR_EVENT[input.productEventType];
  const touchpoint = await recordTouchpoint({
    profileId: profile.id,
    organizationId: input.organizationId ?? null,
    campaignId: input.campaignId ?? null,
    type: touchpointType,
    occurredAt,
    sourceSystem: input.source,
    externalRef: input.externalEventId,
    metadata: input.metadata,
    isDemo: input.isDemo,
  });

  let journeyId: string | null = null;
  const journeyType = JOURNEY_FOR_EVENT[input.productEventType];
  if (journeyType) {
    if (input.productEventType === "SECURELINK_DRAFT_STARTED") {
      const open = await getOpenJourney(profile.id, journeyType);
      if (open) {
        const advanced = await advanceJourney(open.id, "draft_started", input.externalEventId);
        journeyId = advanced?.id ?? open.id;
      } else {
        const started = await startJourney({
          profileId: profile.id,
          journeyType,
          currentStep: "draft_started",
          originCampaignId: input.campaignId ?? null,
          originTouchpointId: touchpoint.id,
          resumeReference: input.externalEventId,
          isDemo: input.isDemo,
        });
        journeyId = started.id;
      }
    } else {
      // A "*_CREATED" event completes its journey — if none was open
      // (event arrived without a prior draft-started event), start and
      // complete one in the same step so the journey record still exists.
      const open = await getOpenJourney(profile.id, journeyType);
      if (open) {
        const completed = await completeJourney(open.id);
        journeyId = completed?.id ?? open.id;
      } else {
        const started = await startJourney({
          profileId: profile.id,
          journeyType,
          currentStep: "created",
          originCampaignId: input.campaignId ?? null,
          originTouchpointId: touchpoint.id,
          isDemo: input.isDemo,
        });
        const completed = await completeJourney(started.id);
        journeyId = completed?.id ?? started.id;
      }
    }
  }

  let conversionId: string | null = null;
  const firstConversionType = FIRST_CONVERSION_FOR_EVENT[input.productEventType];
  const alwaysConversionType = ALWAYS_CONVERSION_FOR_EVENT[input.productEventType];

  if (alwaysConversionType) {
    const result = await recordConversionEvent({
      profileId: profile.id,
      organizationId: input.organizationId ?? null,
      conversionType: alwaysConversionType,
      occurredAt,
      sourceProductEventId: productEvent!.id,
      isDemo: input.isDemo,
    });
    conversionId = result.conversion.id;
  } else if (firstConversionType) {
    const priorTouchCount = await countPriorTouchpoints(profile.id, touchpointType, touchpoint.id);
    if (priorTouchCount === 0) {
      const result = await recordConversionEvent({
        profileId: profile.id,
        organizationId: input.organizationId ?? null,
        conversionType: firstConversionType,
        occurredAt,
        sourceProductEventId: productEvent!.id,
        isDemo: input.isDemo,
      });
      conversionId = result.conversion.id;
    } else {
      await recordTouchpoint({
        profileId: profile.id,
        organizationId: input.organizationId ?? null,
        campaignId: input.campaignId ?? null,
        type: "PRODUCT_REUSED",
        occurredAt,
        sourceSystem: input.source,
        externalRef: `${input.externalEventId}:reuse`,
        isDemo: input.isDemo,
      });
      const result = await recordConversionEvent({
        profileId: profile.id,
        organizationId: input.organizationId ?? null,
        conversionType: "REPEAT_USE",
        occurredAt,
        sourceProductEventId: productEvent!.id,
        isDemo: input.isDemo,
      });
      conversionId = result.conversion.id;
    }
  }

  await db
    .update(schema.productEvents)
    .set({ status: "PROCESSED" })
    .where(eq(schema.productEvents.id, productEvent!.id));

  await recordAuditEvent({
    eventType: "PRODUCT_EVENT_INGESTED",
    targetType: "product_event",
    targetId: productEvent!.id,
    metadata: {
      source: input.source,
      productEventType: input.productEventType,
      profileId: profile.id,
      isDemo: input.isDemo,
    },
  });

  await recomputeNextBestAction(profile.id);

  return {
    status: "PROCESSED",
    productEventId: productEvent!.id,
    profileId: profile.id,
    touchpointId: touchpoint.id,
    journeyId,
    conversionId,
  };
}

async function countPriorTouchpoints(profileId: string, type: TouchpointType, excludeId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.touchpoints.id })
    .from(schema.touchpoints)
    .where(and(eq(schema.touchpoints.profileId, profileId), eq(schema.touchpoints.type, type)));
  return rows.filter((r) => r.id !== excludeId).length;
}
