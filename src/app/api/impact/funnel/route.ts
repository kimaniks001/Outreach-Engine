import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { computeFunnelSummary, computeDropOffFindings } from "@/lib/attribution/funnel";

// IMPACT pillar — Phase 4 brief Sections 25/26/30. Deterministic
// diagnostic findings only, no Growth Director recommendations.
export async function GET(req: NextRequest) {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId") || undefined;

  const summary = await computeFunnelSummary(campaignId);
  const dropOffFindings = computeDropOffFindings(summary);

  return NextResponse.json({ funnel: summary, dropOffFindings });
}
