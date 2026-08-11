import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { evaluateAndPersist, ExperimentEvaluationError } from "@/lib/experiments/evaluation";

const bodySchema = z.object({ useAiNarrative: z.boolean().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const outcome = await evaluateAndPersist(id, {
      useAiNarrative: parsed.data.useAiNarrative,
      requestedByUserId: user!.id,
      generatedByUserId: user!.id,
    });
    return NextResponse.json({ outcome }, { status: 201 });
  } catch (err) {
    if (err instanceof ExperimentEvaluationError) {
      return NextResponse.json({ error: "EVALUATION_ERROR", message: err.message }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "EVALUATE_FAILED", message }, { status: 400 });
  }
}
