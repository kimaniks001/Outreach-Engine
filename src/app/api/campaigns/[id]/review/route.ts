import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { reviewCampaign } from "@/lib/campaigns/campaigns";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REVISION_REQUESTED"]),
  notes: z.string().optional(),
});

// approve on campaigns = Owner + Growth Director, per
// docs/ACCESS_CONTROL_MODEL.md Section 4 and the Phase 2 brief Section 15.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "campaigns");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const campaign = await reviewCampaign(id, parsed.data.action, user!.id, parsed.data.notes);
    if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "REVIEW_FAILED", message }, { status: 400 });
  }
}
