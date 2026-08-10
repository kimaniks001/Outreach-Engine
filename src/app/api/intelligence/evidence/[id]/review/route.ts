import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { reviewEvidence } from "@/lib/intelligence/evidence";
import { schema } from "@/lib/db";

const reviewSchema = z.object({
  verificationStatus: z.enum(schema.verificationStatusEnum.enumValues),
  notes: z.string().optional(),
});

// The only way evidence can become VERIFIED — a distinct, explicit action
// from creation. Owner-only (approve on intelligence). See
// docs/SOURCE_PROVENANCE.md Section 3.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "intelligence");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const evidence = await reviewEvidence(id, parsed.data.verificationStatus, user!.id, parsed.data.notes);
  if (!evidence) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ evidence });
}
