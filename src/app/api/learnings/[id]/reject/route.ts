import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { rejectLearning } from "@/lib/learning/learnings";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  const learning = await rejectLearning(id, user!.id);
  if (!learning) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ learning });
}
