import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { computeCampaignScorecard, computeChannelScorecard, computeProductScorecards, computeAudienceScorecard } from "@/lib/impact/scorecards";
import { schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");
  const channel = searchParams.get("channel");
  const audienceSegmentId = searchParams.get("audienceSegmentId");

  if (campaignId) return NextResponse.json({ scorecard: await computeCampaignScorecard(campaignId) });
  if (channel && (schema.channelTypeEnum.enumValues as readonly string[]).includes(channel)) {
    return NextResponse.json({ scorecard: await computeChannelScorecard(channel as (typeof schema.channelTypeEnum.enumValues)[number]) });
  }
  if (audienceSegmentId) return NextResponse.json({ scorecard: await computeAudienceScorecard(audienceSegmentId) });

  return NextResponse.json({ products: await computeProductScorecards() });
}
