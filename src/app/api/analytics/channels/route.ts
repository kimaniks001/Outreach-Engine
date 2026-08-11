import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { computeChannelScorecard } from "@/lib/impact/scorecards";
import { CHANNEL_TYPES } from "@/lib/distribution/channels";

export async function GET() {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const channels = await Promise.all(CHANNEL_TYPES.map((c) => computeChannelScorecard(c)));
  return NextResponse.json({ channels: channels.filter((c) => c.reach > 0) });
}
