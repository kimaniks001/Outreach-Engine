import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { computeEfficiencySummary, computeRoi } from "@/lib/impact/roi";

export async function GET() {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const [efficiency, roi] = await Promise.all([computeEfficiencySummary(), computeRoi()]);
  return NextResponse.json({ efficiency, roi });
}
