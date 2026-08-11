import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Matches docs/AUDIT_AND_CONTROL.md Section 2, extended with ACCESS_DENIED
// (needed to make server-side RBAC enforcement observable, per
// docs/ACCESS_CONTROL_MODEL.md Section 5) and the AI-specific event Phase 1
// introduces (AI_EXECUTION, for docs/AI_GOVERNANCE.md Section 6
// traceability).
export const AUDIT_EVENT_TYPES = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "ACCESS_DENIED",
  "ROLE_CHANGED",
  "PROVIDER_CONFIG_CHANGED",
  "MODEL_CONFIG_CHANGED",
  "SAFE_MODE_CHANGED",
  "AI_EXECUTION",
  // Phase 2 — docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md
  "SIGNAL_CREATED",
  "EVIDENCE_ADDED",
  "EVIDENCE_REVIEWED",
  "OPPORTUNITY_ANALYZED",
  "OPPORTUNITY_REVIEWED",
  "CAMPAIGN_CREATED",
  "CAMPAIGN_BRAND_REVIEWED",
  "CAMPAIGN_REVIEWED",
  "CREATIVE_GENERATED",
  // Phase 3 — docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md
  "AUDIENCE_CREATED",
  "AUDIENCE_CLASSIFIED",
  "AUDIENCE_REVIEWED",
  "CHANNEL_RECOMMENDATION_GENERATED",
  "DISTRIBUTION_PLAN_CREATED",
  "DISTRIBUTION_PLAN_REVIEWED",
  "DISTRIBUTION_PLAN_BRAND_REVIEWED",
  "BUDGET_PROPOSED",
  "BUDGET_APPROVED",
  "EXECUTION_STARTED",
  "EXECUTION_PAUSED",
  "EXECUTION_FAILED",
  "EXECUTION_CANCELLED",
  "SAFE_MODE_BLOCKED_EXECUTION",
  // Phase 4 — docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md
  "PROFILE_CREATED",
  "PROFILE_LINKED",
  "PROFILE_MERGED",
  "PROFILE_UNLINKED",
  "ORGANIZATION_CREATED",
  "CONSENT_UPDATED",
  "SUPPRESSION_APPLIED",
  "SUPPRESSION_REMOVED",
  "TOUCHPOINT_RECORDED",
  "PRODUCT_EVENT_INGESTED",
  "PRODUCT_EVENT_DUPLICATE",
  "PRODUCT_EVENT_REJECTED",
  "JOURNEY_STARTED",
  "JOURNEY_COMPLETED",
  "JOURNEY_ABANDONED",
  "LIFECYCLE_CHANGED",
  "CONVERSION_RECORDED",
  "ATTRIBUTION_CREATED",
  "NEXT_BEST_ACTION_CHANGED",
  "RETARGETING_ELIGIBILITY_CHANGED",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface RecordAuditEventInput {
  eventType: AuditEventType;
  actorUserId?: string | null;
  actorLabel?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

// Append-only by convention: no update/delete helpers exist for this table.
// Never pass secret values in `metadata` — see docs/AUDIT_AND_CONTROL.md
// Section 3 ("do not log secrets").
export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  await db.insert(schema.auditEvents).values({
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    actorLabel: input.actorLabel ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}

export interface AuditEventRow {
  id: string;
  eventType: string;
  actorLabel: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export async function listRecentAuditEvents(limit = 100): Promise<AuditEventRow[]> {
  const rows = await db
    .select({
      id: schema.auditEvents.id,
      eventType: schema.auditEvents.eventType,
      actorLabel: schema.auditEvents.actorLabel,
      actorEmail: schema.users.email,
      targetType: schema.auditEvents.targetType,
      targetId: schema.auditEvents.targetId,
      metadata: schema.auditEvents.metadata,
      createdAt: schema.auditEvents.createdAt,
    })
    .from(schema.auditEvents)
    .leftJoin(schema.users, eq(schema.auditEvents.actorUserId, schema.users.id))
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(limit);

  return rows;
}

// Used by the Today dashboard to show honest, non-fabricated counts (e.g.
// blocked Safe Mode execution attempts) without pulling full event rows.
export async function countAuditEventsByType(eventType: AuditEventType): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.eventType, eventType));
  return rows[0]?.count ?? 0;
}
