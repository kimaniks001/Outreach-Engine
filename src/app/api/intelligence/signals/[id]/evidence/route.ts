import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { addEvidence } from "@/lib/intelligence/evidence";
import { schema } from "@/lib/db";

const addSchema = z.object({
  sourceName: z.string().min(1),
  sourceReference: z.string().optional(),
  sourceType: z.enum(schema.evidenceSourceTypeEnum.enumValues),
  publishedAt: z.string().datetime().optional(),
  extractedClaim: z.string().min(1),
  evidenceSnippet: z.string().optional(),
  confidence: z.number().min(0).max(1),
  contradictionsNotes: z.string().optional(),
});

// create on intelligence = Owner only, per the literal Phase 0 grant table
// (see docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md RBAC section).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("create", "intelligence");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const evidence = await addEvidence(
    {
      marketSignalId: id,
      ...parsed.data,
      publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : null,
    },
    user!.id
  );

  return NextResponse.json({ evidence }, { status: 201 });
}
