import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getRecommendation } from "@/lib/growth-director/engine";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  const { id } = await params;
  const recommendation = await getRecommendation(id);
  if (!recommendation) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ recommendation });
}
