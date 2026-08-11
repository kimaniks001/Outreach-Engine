import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getJourney } from "@/lib/journeys/journeys";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { id } = await params;
  const journey = await getJourney(id);
  if (!journey) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ journey });
}
