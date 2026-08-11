import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { approveRecommendation, ApprovalError } from "@/lib/growth-director/approval";

const bodySchema = z.object({ notes: z.string().optional() });

// approve on `campaigns` = OWNER + GROWTH_DIRECTOR (both already hold this
// capability). HIGH-risk recommendations are further restricted to
// OWNER-only inside approveRecommendation() itself — see
// src/lib/growth-director/approval.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "campaigns");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const recommendation = await approveRecommendation(id, user!.id, user!.role, parsed.data.notes);
    if (!recommendation) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ recommendation });
  } catch (err) {
    if (err instanceof ApprovalError) {
      return NextResponse.json({ error: "APPROVAL_DENIED", message: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "APPROVE_FAILED", message }, { status: 400 });
  }
}
