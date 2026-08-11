import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { reviewDistributionPlan } from "@/lib/distribution/plans";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  notes: z.string().optional(),
});

// approve on `distribution` = OWNER only — the literal grant table gives
// GROWTH_DIRECTOR view-only on `distribution` (unlike its explicit approve
// grant on `campaigns`). See docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md's
// RBAC reading decision.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "distribution");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const plan = await reviewDistributionPlan(id, parsed.data.action, user!.id, parsed.data.notes);
    if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "REVIEW_FAILED", message }, { status: 400 });
  }
}
