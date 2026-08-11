import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listExecutionsForPlan } from "@/lib/distribution/executions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "distribution");
  if (response) return response;

  const { id } = await params;
  const executions = await listExecutionsForPlan(id);
  return NextResponse.json({ executions });
}
