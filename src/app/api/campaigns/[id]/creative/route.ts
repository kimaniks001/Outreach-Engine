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

  // Content-only roles must not use guessed campaign ids to enumerate whether
  // a campaign exists. Until strategy has handed work into creative by making
  // at least one variant, the content projection behaves as not found.
  if (!can(user!.role, "view", "campaigns") && variants.length === 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ variants });
}

const generationSchema = z.object({
  preferredModelId: z.string().uuid().optional(),
}).strict();

// Strategy/campaign editors may initiate the creative handoff. Content-only
// creators may continue generating variants only after that handoff exists.
// This prevents a guessed campaign id from becoming an indirect strategy
// disclosure channel. A preferred model never bypasses the governed registry.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const campaignEditor = can(user!.role, "edit", "campaigns");
  const contentCreator = can(user!.role, "create", "content");
  if (!campaignEditor && !contentCreator) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;

  if (!campaignEditor) {
    const existing = await listVariantsForCampaign(id);
    if (existing.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
  }

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
