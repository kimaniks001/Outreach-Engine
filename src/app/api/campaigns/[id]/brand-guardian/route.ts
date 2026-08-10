import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { runCampaignBrandGuardian } from "@/lib/campaigns/campaigns";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  try {
    const outcome = await runCampaignBrandGuardian(id, user!.id);
    return NextResponse.json({ outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "BRAND_GUARDIAN_FAILED", message }, { status: 400 });
  }
}
