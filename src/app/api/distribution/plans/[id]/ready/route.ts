import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { markDistributionPlanReady, PlanNotReadyError } from "@/lib/distribution/plans";

// approve on `distribution` = OWNER only — marking a plan READY finalizes
// every execution precondition (Brand Guardian PASS, budget APPROVED), so
// it carries the same authority as approval itself.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "distribution");
  if (response) return response;

  const { id } = await params;
  try {
    const plan = await markDistributionPlanReady(id, user!.id);
    return NextResponse.json({ plan });
  } catch (err) {
    if (err instanceof PlanNotReadyError) {
      return NextResponse.json({ error: "PLAN_NOT_READY", message: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "READY_FAILED", message }, { status: 400 });
  }
}
