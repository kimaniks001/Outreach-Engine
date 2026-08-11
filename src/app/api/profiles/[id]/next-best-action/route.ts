import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getCurrentNextBestAction, listNextBestActionHistory, recomputeNextBestAction } from "@/lib/next-best-action/engine";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  if (searchParams.get("history") === "true") {
    return NextResponse.json({ history: await listNextBestActionHistory(id) });
  }
  return NextResponse.json({ nextBestAction: await getCurrentNextBestAction(id) });
}

const recomputeSchema = z.object({ useAiNarrative: z.boolean().optional() });

// edit on `audience` = OWNER only. The deterministic engine always decides
// eligibility; useAiNarrative only ever appends explanatory text — see
// docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md Section 19.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = recomputeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const nextBestAction = await recomputeNextBestAction(id, {
      useAiNarrative: parsed.data.useAiNarrative,
      requestedByUserId: user!.id,
      generatedByUserId: user!.id,
    });
    return NextResponse.json({ nextBestAction }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "RECOMPUTE_FAILED", message }, { status: 400 });
  }
}
