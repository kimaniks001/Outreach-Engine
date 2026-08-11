import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getExperiment, listVariants, listExperimentResults } from "@/lib/experiments/experiments";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "campaigns");
  if (response) return response;

  const { id } = await params;
  const experiment = await getExperiment(id);
  if (!experiment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const [variants, results] = await Promise.all([listVariants(id), listExperimentResults(id)]);
  return NextResponse.json({ experiment, variants, results });
}
