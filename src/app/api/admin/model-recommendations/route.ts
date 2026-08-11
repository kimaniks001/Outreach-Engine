import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listModelRecommendations, generateModelRecommendations } from "@/lib/model-evaluation/recommendations";
import { schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { response } = await requireApiCapability("view", "model-config");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const recommendations = await listModelRecommendations({
    status: (searchParams.get("status") as (typeof schema.modelRecommendationStatusEnum.enumValues)[number]) || undefined,
  });
  return NextResponse.json({ recommendations });
}

export async function POST() {
  const { user, response } = await requireApiCapability("create", "model-config");
  if (response) return response;

  const recommendations = await generateModelRecommendations(user!.id);
  return NextResponse.json({ recommendations }, { status: 201 });
}
