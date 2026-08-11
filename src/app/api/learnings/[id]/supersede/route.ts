import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { supersedeLearning } from "@/lib/learning/learnings";

const bodySchema = z.object({ newLearningId: z.string().uuid() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const learning = await supersedeLearning(id, parsed.data.newLearningId, user!.id);
  if (!learning) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ learning });
}
