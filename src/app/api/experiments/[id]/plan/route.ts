import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { planExperiment } from "@/lib/experiments/experiments";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  try {
    const experiment = await planExperiment(id);
    return NextResponse.json({ experiment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "PLAN_FAILED", message }, { status: 400 });
  }
}
