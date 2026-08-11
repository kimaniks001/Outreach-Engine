import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

// Product Journey state — Phase 4 brief Section 15. journeys are
// per-profile-per-journeyType: only one STARTED/IN_PROGRESS journey of a
// given type is open at a time (src/lib/product-events/ingest.ts resumes
// the open one rather than creating a duplicate when a later event for the
// same journeyType arrives).

export type JourneyType = (typeof schema.journeyTypeEnum.enumValues)[number];
export type JourneyStatus = (typeof schema.journeyStatusEnum.enumValues)[number];

export interface StartJourneyInput {
  profileId: string;
  journeyType: JourneyType;
  currentStep: string;
  originCampaignId?: string | null;
  originTouchpointId?: string | null;
  productReference?: string | null;
  resumeReference?: string | null;
  isDemo?: boolean;
}

export async function startJourney(input: StartJourneyInput) {
  const [row] = await db
    .insert(schema.productJourneys)
    .values({
      profileId: input.profileId,
      journeyType: input.journeyType,
      currentStep: input.currentStep,
      status: "STARTED",
      originCampaignId: input.originCampaignId ?? null,
      originTouchpointId: input.originTouchpointId ?? null,
      productReference: input.productReference ?? null,
      resumeReference: input.resumeReference ?? null,
      isDemo: input.isDemo ?? false,
    })
    .returning();

  await recordAuditEvent({
    eventType: "JOURNEY_STARTED",
    targetType: "product_journey",
    targetId: row!.id,
    metadata: { profileId: input.profileId, journeyType: input.journeyType },
  });

  return row!;
}

export async function getOpenJourney(profileId: string, journeyType: JourneyType) {
  const rows = await db
    .select()
    .from(schema.productJourneys)
    .where(and(eq(schema.productJourneys.profileId, profileId), eq(schema.productJourneys.journeyType, journeyType)))
    .orderBy(desc(schema.productJourneys.startedAt));

  return rows.find((r) => r.status === "STARTED" || r.status === "IN_PROGRESS") ?? null;
}

export async function getJourney(id: string) {
  const rows = await db.select().from(schema.productJourneys).where(eq(schema.productJourneys.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface ListJourneysFilters {
  profileId?: string;
  status?: JourneyStatus;
  journeyType?: JourneyType;
}

export async function listJourneys(filters: ListJourneysFilters = {}) {
  const conditions = [];
  if (filters.profileId) conditions.push(eq(schema.productJourneys.profileId, filters.profileId));
  if (filters.status) conditions.push(eq(schema.productJourneys.status, filters.status));
  if (filters.journeyType) conditions.push(eq(schema.productJourneys.journeyType, filters.journeyType));

  return db
    .select()
    .from(schema.productJourneys)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.productJourneys.lastActivityAt));
}

export async function advanceJourney(journeyId: string, currentStep: string, resumeReference?: string | null) {
  const [row] = await db
    .update(schema.productJourneys)
    .set({
      currentStep,
      status: "IN_PROGRESS",
      resumeReference: resumeReference ?? undefined,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.productJourneys.id, journeyId))
    .returning();
  return row ?? null;
}

export async function completeJourney(journeyId: string) {
  const [row] = await db
    .update(schema.productJourneys)
    .set({ status: "COMPLETED", completedAt: new Date(), lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.productJourneys.id, journeyId))
    .returning();

  if (row) {
    await recordAuditEvent({
      eventType: "JOURNEY_COMPLETED",
      targetType: "product_journey",
      targetId: row.id,
      metadata: { profileId: row.profileId, journeyType: row.journeyType },
    });
  }

  return row ?? null;
}

export async function abandonJourney(journeyId: string, reason: string) {
  const [row] = await db
    .update(schema.productJourneys)
    .set({ status: "ABANDONED", abandonmentReason: reason, updatedAt: new Date() })
    .where(eq(schema.productJourneys.id, journeyId))
    .returning();

  if (row) {
    await recordAuditEvent({
      eventType: "JOURNEY_ABANDONED",
      targetType: "product_journey",
      targetId: row.id,
      metadata: { profileId: row.profileId, journeyType: row.journeyType, reason },
    });
  }

  return row ?? null;
}
