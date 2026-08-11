import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { createLearningFromExperiment } from "@/lib/learning/learnings";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  try {
    const learning = await createLearningFromExperiment(id, user!.id);
    return NextResponse.json({ learning }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CREATE_FAILED", message }, { status: 400 });
  }
}
