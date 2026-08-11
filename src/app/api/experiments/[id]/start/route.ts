import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { startExperiment } from "@/lib/experiments/experiments";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  try {
    const experiment = await startExperiment(id, user!.id);
    return NextResponse.json({ experiment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "START_FAILED", message }, { status: 400 });
  }
}
