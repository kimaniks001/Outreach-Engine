import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { DistributionGateway } from "@/lib/distribution/gateway";

// approve on `distribution` = OWNER only. Launch is the single HIGH-risk
// consequential action this phase implements — every precondition (Safe
// Mode, budget, Brand Guardian, plan READY) is re-checked server-side
// inside the gateway itself, not just here. See
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Sections 13-14.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "distribution");
  if (response) return response;

  const { id } = await params;
  const outcome = await DistributionGateway.launch(id, user!.id);

  switch (outcome.outcome) {
    case "LAUNCHED":
      return NextResponse.json({ outcome });
    case "SAFE_MODE_BLOCKED":
      return NextResponse.json({ outcome }, { status: 409 });
    case "BUDGET_NOT_APPROVED":
    case "PLAN_NOT_READY":
      return NextResponse.json({ outcome }, { status: 409 });
    case "ADAPTER_NOT_AVAILABLE":
    case "EXECUTION_ERROR":
      return NextResponse.json({ outcome }, { status: 422 });
    default:
      return NextResponse.json({ outcome }, { status: 400 });
  }
}
