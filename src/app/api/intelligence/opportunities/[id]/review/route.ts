import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { reviewOpportunity } from "@/lib/intelligence/opportunities";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "ARCHIVE"]),
  notes: z.string().optional(),
});

// Owner-only (approve on intelligence) — see
// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md RBAC section.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "intelligence");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const opportunity = await reviewOpportunity(id, parsed.data.action, user!.id, parsed.data.notes);
  if (!opportunity) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ opportunity });
}
