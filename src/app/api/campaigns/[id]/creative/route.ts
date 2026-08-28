import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { generateVariantsForCampaign, listVariantsForCampaign } from "@/lib/creative/variants";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  if (!can(user!.role, "view", "campaigns") && !can(user!.role, "view", "content")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const variants = await listVariantsForCampaign(id);
  return NextResponse.json({ variants });
}

const generationSchema = z.object({
  preferredModelId: z.string().uuid().optional(),
}).strict();

// Studio generation is creative work. Campaign editors (Owner/Strategist)
// and authorised content creators may generate variants. A preferred model
// never bypasses registry/routing approval: the AI Gateway fails closed if
// it is not currently routable for CREATIVE_IDEATION.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  if (!can(user!.role, "edit", "campaigns") && !can(user!.role, "create", "content")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const raw = await req.json().catch(() => ({}));
  const parsed = generationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await generateVariantsForCampaign(id, user!.id, parsed.data.preferredModelId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "GENERATION_FAILED", message }, { status: 400 });
  }
}
