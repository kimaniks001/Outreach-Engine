import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";

export interface AddEvidenceInput {
  marketSignalId: string;
  sourceName: string;
  sourceReference?: string | null;
  sourceType: (typeof schema.evidenceSourceTypeEnum.enumValues)[number];
  publishedAt?: Date | null;
  extractedClaim: string;
  evidenceSnippet?: string | null;
  confidence: number; // 0..1
  contradictionsNotes?: string | null;
}

// docs/SOURCE_PROVENANCE.md Section 3 — a signal cannot become VERIFIED
// just by someone claiming it is at submission time. New evidence always
// starts at NEEDS_REVIEW or WEAK_EVIDENCE; only reviewEvidence() (a
// separate, explicit action) can promote something to VERIFIED. See the
// Phase 2 brief Section 30 test requirement.
export async function addEvidence(input: AddEvidenceInput, actorUserId: string) {
  const [row] = await db
    .insert(schema.sourceEvidence)
    .values({
      marketSignalId: input.marketSignalId,
      sourceName: input.sourceName,
      sourceReference: input.sourceReference ?? null,
      sourceType: input.sourceType,
      publishedAt: input.publishedAt ?? null,
      extractedClaim: input.extractedClaim,
      evidenceSnippet: input.evidenceSnippet ?? null,
      confidence: String(input.confidence),
      verificationStatus: input.confidence >= 0.6 ? "NEEDS_REVIEW" : "WEAK_EVIDENCE",
      contradictionsNotes: input.contradictionsNotes ?? null,
      classification: "CONFIDENTIAL",
      createdByUserId: actorUserId,
    })
    .returning();

  await recordAuditEvent({
    eventType: "EVIDENCE_ADDED",
    actorUserId,
    targetType: "source_evidence",
    targetId: row!.id,
    metadata: { marketSignalId: input.marketSignalId, sourceName: input.sourceName },
  });

  return row!;
}

export async function reviewEvidence(
  evidenceId: string,
  verificationStatus: (typeof schema.verificationStatusEnum.enumValues)[number],
  actorUserId: string,
  notes?: string
) {
  const [row] = await db
    .update(schema.sourceEvidence)
    .set({ verificationStatus, contradictionsNotes: notes, updatedAt: new Date() })
    .where(eq(schema.sourceEvidence.id, evidenceId))
    .returning();

  await recordAuditEvent({
    eventType: "EVIDENCE_REVIEWED",
    actorUserId,
    targetType: "source_evidence",
    targetId: evidenceId,
    metadata: { verificationStatus },
  });

  return row ?? null;
}

export async function listEvidenceForSignal(marketSignalId: string) {
  return db
    .select()
    .from(schema.sourceEvidence)
    .where(eq(schema.sourceEvidence.marketSignalId, marketSignalId))
    .orderBy(schema.sourceEvidence.createdAt);
}

// A signal with zero evidence rows is MANUAL/UNVERIFIED by construction —
// see docs/SOURCE_PROVENANCE.md and the Phase 2 brief Section 8.
export async function isManualUnverified(marketSignalId: string): Promise<boolean> {
  const rows = await listEvidenceForSignal(marketSignalId);
  return rows.length === 0;
}
