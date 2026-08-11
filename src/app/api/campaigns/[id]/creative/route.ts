import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { generateVariantsForCampaign, listVariantsForCampaign } from "@/lib/creative/variants";

// Visible to anyone who can view campaigns OR content (Content & Engagement
// reaches creative variants via the `content` resource, not `campaigns` —
// see docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md RBAC section).
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

// Generation is part of campaign drafting — Owner + Strategist (edit on
// campaigns), max 3 variants per call, AI-first with a deterministic
// fallback (see src/lib/creative/variants.ts).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  if (!can(user!.role, "edit", "campaigns")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const result = await generateVariantsForCampaign(id, user!.id);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "GENERATION_FAILED", message }, { status: 400 });
  }
}
