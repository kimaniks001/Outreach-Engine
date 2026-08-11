import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { computeImpactSummary } from "@/lib/attribution/funnel";

export async function GET() {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  return NextResponse.json({ summary: await computeImpactSummary() });
}
