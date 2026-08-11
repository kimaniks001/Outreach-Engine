import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { markReviewed } from "@/lib/commercial-memory/retention";

const bodySchema = z.object({ reason: z.string().min(1) });

// edit on `audience` = OWNER only, same precedent as every other
// commercial-memory mutation (Phase 4).
export async function POST(req: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const { profileId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const action = await markReviewed(profileId, user!.id, parsed.data.reason);
  return NextResponse.json({ action }, { status: 201 });
}
