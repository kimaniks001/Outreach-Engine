import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/rbac/guard";
import { reviewComplianceLegal } from "@/lib/approvals/market-release";

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REVISION_REQUIRED"]),
  notes: z.string().max(2000).optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  if (user!.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }
  const { id } = await params;
  try {
    const decision = await reviewComplianceLegal(id, parsed.data.action, user!.id, user!.role, parsed.data.notes);
    return NextResponse.json({ decision });
  } catch (err) {
    return NextResponse.json({ error: "REVIEW_FAILED", message: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}
