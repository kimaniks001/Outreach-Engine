import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

export interface CreateSignalInput {
  title: string;
  summary: string;
  signalType: (typeof schema.signalTypeEnum.enumValues)[number];
  publishedAt?: Date | null;
  tags?: string[];
  notes?: string | null;
  classification?: (typeof schema.classificationEnum.enumValues)[number];
  isDemo?: boolean;
}

export async function createSignal(input: CreateSignalInput, actorUserId: string) {
  const [row] = await db
    .insert(schema.marketSignals)
    .values({
      title: input.title,
      summary: input.summary,
      signalType: input.signalType,
      publishedAt: input.publishedAt ?? null,
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      classification: input.classification ?? "CONFIDENTIAL",
      isDemo: input.isDemo ?? false,
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "SIGNAL_CREATED",
    actorUserId,
    targetType: "market_signal",
    targetId: row!.id,
    metadata: { title: input.title, signalType: input.signalType, isDemo: row!.isDemo },
  });

  return row!;
}

export interface SignalListFilters {
  status?: (typeof schema.signalStatusEnum.enumValues)[number];
  signalType?: (typeof schema.signalTypeEnum.enumValues)[number];
}

export async function listSignalsWithEvidenceCount(filters: SignalListFilters = {}) {
  const rows = await db
    .select({
      signal: schema.marketSignals,
      evidenceCount: sql<number>`count(${schema.sourceEvidence.id})::int`,
    })
    .from(schema.marketSignals)
    .leftJoin(schema.sourceEvidence, eq(schema.sourceEvidence.marketSignalId, schema.marketSignals.id))
    .groupBy(schema.marketSignals.id)
    .orderBy(desc(schema.marketSignals.createdAt));

  return rows.filter((r) => {
    if (filters.status && r.signal.status !== filters.status) return false;
    if (filters.signalType && r.signal.signalType !== filters.signalType) return false;
    return true;
  });
}

export async function getSignal(id: string) {
  const rows = await db.select().from(schema.marketSignals).where(eq(schema.marketSignals.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function markSignalAnalyzed(id: string) {
  await db.update(schema.marketSignals).set({ status: "ANALYZED", updatedAt: new Date() }).where(eq(schema.marketSignals.id, id));
}
