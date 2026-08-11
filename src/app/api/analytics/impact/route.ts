import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { computeImpactSummary, computeFunnelSummary } from "@/lib/attribution/funnel";
import { computeEfficiencySummary, computeRoi } from "@/lib/impact/roi";

export async function GET() {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const [summary, funnel, efficiency, roi] = await Promise.all([
    computeImpactSummary(),
    computeFunnelSummary(),
    computeEfficiencySummary(),
    computeRoi(),
  ]);

  return NextResponse.json({ summary, funnel, efficiency, roi });
}
