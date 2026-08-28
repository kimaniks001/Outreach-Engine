import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/rbac/guard";
import { setClaimSourceStatus } from "@/lib/approvals/market-release";

const statusSchema = z.object({
  status: z.enum(["CURRENT", "SUPERSEDED", "RETIRED"]),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  if (user!.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = statusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  const { id } = await params;
  try {
    const source = await setClaimSourceStatus(id, parsed.data.status, user!.id, user!.role);
    return NextResponse.json({ source });
  } catch (err) {
    return NextResponse.json({ error: "UPDATE_FAILED", message: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}
