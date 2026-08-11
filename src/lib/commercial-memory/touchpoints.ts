import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { recomputeLifecycle } from "./lifecycle";
import { touchOrganization } from "./organizations";

// Append-oriented commercial touch history — Phase 4 brief Section 12.
// metadata is intentionally typed as a shallow string/number/boolean map
// (see src/lib/db/schema.ts) so no arbitrary free-form/sensitive payload
// can be smuggled in through it.

export type TouchpointType = (typeof schema.touchpointTypeEnum.enumValues)[number];
export type Channel = (typeof schema.channelTypeEnum.enumValues)[number];

export interface RecordTouchpointInput {
  profileId: string;
  organizationId?: string | null;
  campaignId?: string | null;
  distributionPlanId?: string | null;
  executionId?: string | null;
  channel?: Channel | null;
  type: TouchpointType;
  occurredAt?: Date;
  sourceSystem?: string;
  externalRef?: string | null;
  metadata?: Record<string, string | number | boolean>;
  classification?: (typeof schema.classificationEnum.enumValues)[number];
  isDemo?: boolean;
}

export async function recordTouchpoint(input: RecordTouchpointInput) {
  const [row] = await db
    .insert(schema.touchpoints)
    .values({
      profileId: input.profileId,
      organizationId: input.organizationId ?? null,
      campaignId: input.campaignId ?? null,
      distributionPlanId: input.distributionPlanId ?? null,
      executionId: input.executionId ?? null,
      channel: input.channel ?? null,
      type: input.type,
      occurredAt: input.occurredAt ?? new Date(),
      sourceSystem: input.sourceSystem ?? "outreach_engine",
      externalRef: input.externalRef ?? null,
      metadata: input.metadata ?? {},
      classification: input.classification ?? "INTERNAL",
      isDemo: input.isDemo ?? false,
    })
    .returning();

  await db
    .update(schema.audienceProfiles)
    .set({ lastSeenAt: row!.occurredAt, updatedAt: new Date() })
    .where(eq(schema.audienceProfiles.id, input.profileId));

  if (input.organizationId) await touchOrganization(input.organizationId);

  await recordAuditEvent({
    eventType: "TOUCHPOINT_RECORDED",
    targetType: "touchpoint",
    targetId: row!.id,
    metadata: { profileId: input.profileId, type: input.type, channel: input.channel ?? null, isDemo: row!.isDemo },
  });

  await recomputeLifecycle(input.profileId);

  return row!;
}

export interface ListTouchpointsFilters {
  profileId?: string;
  campaignId?: string;
  type?: TouchpointType;
}

export async function listTouchpoints(filters: ListTouchpointsFilters = {}) {
  const conditions = [];
  if (filters.profileId) conditions.push(eq(schema.touchpoints.profileId, filters.profileId));
  if (filters.campaignId) conditions.push(eq(schema.touchpoints.campaignId, filters.campaignId));
  if (filters.type) conditions.push(eq(schema.touchpoints.type, filters.type));

  const rows = await db
    .select()
    .from(schema.touchpoints)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.touchpoints.occurredAt));

  return rows;
}
