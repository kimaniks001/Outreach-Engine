import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { unlinkProfile } from "@/lib/commercial-memory/identity";

const unlinkSchema = z.object({ reason: z.string().min(1) });

// Manual merge correction — Phase 4 brief Section 10 ("support manual
// unlink/correction by Owner where needed"). edit on `audience` = OWNER
// only, matching the literal grant table.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = unlinkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    await unlinkProfile(id, user!.id, parsed.data.reason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "UNLINK_FAILED", message }, { status: 400 });
  }
}
