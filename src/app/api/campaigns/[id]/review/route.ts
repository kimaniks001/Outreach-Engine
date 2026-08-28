import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { reviewBrandClaims } from "@/lib/approvals/market-release";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REVISION_REQUESTED"]),
  notes: z.string().max(2000).optional(),
}).strict();

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
    const action = parsed.data.action === "REVISION_REQUESTED" ? "REVISION_REQUIRED" : parsed.data.action;
    const result = await reviewBrandClaims(id, action, user!.id, user!.role, parsed.data.notes);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "REVIEW_FAILED", message }, { status: 400 });
  }
}
