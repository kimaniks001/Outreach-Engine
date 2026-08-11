import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { DistributionGateway } from "@/lib/distribution/gateway";

// edit on `distribution` = OWNER + DISTRIBUTION_SALES (approved scope).
// Pausing is deliberately gated lower than launch (approve-only) — stopping
// spend is the safe direction, so the plan's own create/edit owner can do
// it without waiting on Owner approval.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "distribution");
  if (response) return response;

  const { id } = await params;
  const outcome = await DistributionGateway.pause(id, user!.id);

  if (outcome.outcome === "NOT_RUNNING") {
    return NextResponse.json({ outcome }, { status: 409 });
  }
  return NextResponse.json({ outcome });
}
