import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { analyzeSignalAndCreateOpportunity } from "@/lib/intelligence/opportunities";

// Owner-only: this both reads raw intelligence and creates a new
// opportunity (create on intelligence). See
// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md RBAC section.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("create", "intelligence");
  if (response) return response;

  const { id } = await params;

  try {
    const result = await analyzeSignalAndCreateOpportunity(id, user!.id);
    if (!result.ok) {
      // Malformed/unavailable AI output is rejected safely — no
      // opportunity is fabricated. Surface the reason for a retry.
      return NextResponse.json({ error: "ANALYSIS_FAILED", result: result.result }, { status: 422 });
    }
    return NextResponse.json({ opportunity: result.opportunity }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "ANALYSIS_ERROR", message }, { status: 400 });
  }
}
