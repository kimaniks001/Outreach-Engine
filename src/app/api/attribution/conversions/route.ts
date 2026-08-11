import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listConversions } from "@/lib/attribution/conversions";
import { schema } from "@/lib/db";

// IMPACT-pillar output — gated by `analytics`, not `audience` (see
// docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md's RBAC section).
export async function GET(req: NextRequest) {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const conversions = await listConversions({
    profileId: searchParams.get("profileId") || undefined,
    conversionType: (searchParams.get("conversionType") as (typeof schema.conversionTypeEnum.enumValues)[number]) || undefined,
  });
  return NextResponse.json({ conversions });
}
