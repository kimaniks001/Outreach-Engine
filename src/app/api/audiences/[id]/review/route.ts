import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { reviewAudienceSegment } from "@/lib/audience/segments";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "ARCHIVE"]),
  notes: z.string().optional(),
});

// approve on `audience` = OWNER only, per the literal grant table.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "audience");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const segment = await reviewAudienceSegment(id, parsed.data.action, user!.id, parsed.data.notes);
    if (!segment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ segment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "REVIEW_FAILED", message }, { status: 400 });
  }
}
