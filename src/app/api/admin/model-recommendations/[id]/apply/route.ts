import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { applyModelRecommendation } from "@/lib/model-evaluation/recommendations";

// The only code path that actually changes routing policy — approve on
// `model-config` = OWNER only. See docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md
// Section 25 ("Do NOT automatically switch critical task routing").
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "model-config");
  if (response) return response;

  const { id } = await params;
  try {
    const outcome = await applyModelRecommendation(id, user!.id);
    return NextResponse.json({ outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "APPLY_FAILED", message }, { status: 400 });
  }
}
