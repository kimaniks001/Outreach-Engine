import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getCampaignMarketResponseBrief } from "@/lib/impact/market-loop";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const { id } = await params;
  try {
    return NextResponse.json(await getCampaignMarketResponseBrief(id));
  } catch (error) {
    return NextResponse.json(
      { error: "MARKET_RESPONSE_UNAVAILABLE", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 422 }
    );
  }
}
