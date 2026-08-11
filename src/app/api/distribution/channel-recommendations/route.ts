import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { generateChannelRecommendations, listChannelRecommendations } from "@/lib/distribution/recommendations";

export async function GET(req: NextRequest) {
  const { response } = await requireApiCapability("view", "distribution");
  if (response) return response;

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "INVALID_REQUEST", message: "campaignId is required" }, { status: 400 });

  const audienceSegmentId = req.nextUrl.searchParams.get("audienceSegmentId") ?? undefined;
  const recommendations = await listChannelRecommendations(campaignId, audienceSegmentId);
  return NextResponse.json({ recommendations });
}

const generateSchema = z.object({
  campaignId: z.string().uuid(),
  audienceSegmentId: z.string().uuid(),
});

// create on `distribution` = OWNER + DISTRIBUTION_SALES (approved scope),
// per the literal grant table.
export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "distribution");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = generateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const recommendations = await generateChannelRecommendations(parsed.data.campaignId, parsed.data.audienceSegmentId, user!.id);
    return NextResponse.json({ recommendations }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "GENERATION_FAILED", message }, { status: 400 });
  }
}
