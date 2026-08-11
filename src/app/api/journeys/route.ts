import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listJourneys } from "@/lib/journeys/journeys";
import { schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const journeys = await listJourneys({
    profileId: searchParams.get("profileId") || undefined,
    status: (searchParams.get("status") as (typeof schema.journeyStatusEnum.enumValues)[number]) || undefined,
    journeyType: (searchParams.get("journeyType") as (typeof schema.journeyTypeEnum.enumValues)[number]) || undefined,
  });
  return NextResponse.json({ journeys });
}
