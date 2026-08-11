import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

// Lightweight organization/business memory — Phase 4 brief Section 11.
// Deliberately not a CRM pipeline: no pipeline stages, no deal-value
// tracking, no sales-activity log beyond what touchpoints/conversions
// already capture per associated profile.

export interface CreateOrganizationInput {
  legalName: string;
  displayName: string;
  sector?: string | null;
  geography?: string | null;
  website?: string | null;
  businessReferences?: string[];
  useCases?: string[];
  classification?: (typeof schema.classificationEnum.enumValues)[number];
  source?: string;
  isDemo?: boolean;
}

export async function createOrganization(input: CreateOrganizationInput, actorUserId: string) {
  const [row] = await db
    .insert(schema.organizations)
    .values({
      legalName: input.legalName,
      displayName: input.displayName,
      sector: input.sector ?? null,
      geography: input.geography ?? null,
      website: input.website ?? null,
      businessReferences: input.businessReferences ?? [],
      useCases: input.useCases ?? [],
      classification: input.classification ?? "CONFIDENTIAL",
      source: input.source ?? "manual",
      isDemo: input.isDemo ?? false,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "ORGANIZATION_CREATED",
    actorUserId,
    targetType: "organization",
    targetId: row!.id,
    metadata: { displayName: row!.displayName, source: row!.source },
  });

  return row!;
}

export async function getOrganization(id: string) {
  const rows = await db.select().from(schema.organizations).where(eq(schema.organizations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listOrganizations() {
  return db.select().from(schema.organizations).orderBy(desc(schema.organizations.lastSeenAt));
}

export async function listOrganizationProfiles(organizationId: string) {
  return db
    .select()
    .from(schema.audienceProfiles)
    .where(eq(schema.audienceProfiles.organizationId, organizationId))
    .orderBy(desc(schema.audienceProfiles.lastSeenAt));
}

export async function touchOrganization(organizationId: string) {
  await db
    .update(schema.organizations)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.organizations.id, organizationId));
}
