import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { attachClaimSource, listCampaignSources } from "@/lib/approvals/market-release";

const attachSchema = z.object({
  claimSourceId: z.string().uuid(),
  note: z.string().max(1000).optional(),
}).strict();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  if (!can(user!.role, "view", "campaigns") && !can(user!.role, "view", "content")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { id } = await params;
  return NextResponse.json({ sources: await listCampaignSources(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  if (!can(user!.role, "edit", "campaigns") && user!.role !== "OWNER" && user!.role !== "GROWTH_DIRECTOR") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = attachSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }
  const { id } = await params;
  try {
    const attachment = await attachClaimSource(id, parsed.data.claimSourceId, user!.id, user!.role, parsed.data.note);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "ATTACH_FAILED", message: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}
