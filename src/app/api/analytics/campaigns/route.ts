import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listCampaigns } from "@/lib/campaigns/campaigns";
import { computeCampaignScorecard } from "@/lib/impact/scorecards";

// Narrow, read-only internal Analytics API — Phase 5 brief Section 39.
// Aggregate campaign scorecards only. No raw contact identifiers, no
// intelligence sources, no doctrine, no credentials. Session-authenticated
// (same `analytics` view gate as every other analytics read-path) rather
// than a separate external client-auth system — see
// docs/PHASE_5_ANALYTICS_API.md for the documented boundary.
export async function GET() {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const campaigns = await listCampaigns();
  const scorecards = await Promise.all(
    campaigns.map(async (c) => ({
      name: c.name,
      status: c.status,
      ...(await computeCampaignScorecard(c.id)),
    }))
  );

  return NextResponse.json({ campaigns: scorecards });
}
