import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listCurrentModelPerformance, refreshModelPerformance, DEFAULT_EVALUATION_WINDOW_DAYS } from "@/lib/model-evaluation/performance";

export async function GET() {
  const { response } = await requireApiCapability("view", "model-config");
  if (response) return response;

  return NextResponse.json({ performance: await listCurrentModelPerformance() });
}

const refreshSchema = z.object({ windowDays: z.number().min(1).max(365).optional() });

// create on `model-config` = OWNER only, per the literal grant table —
// see docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md's RBAC reading decision.
export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "model-config");
  if (response) return response;

  const json = await req.json().catch(() => ({}));
  const parsed = refreshSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const performance = await refreshModelPerformance(user!.id, parsed.data.windowDays ?? DEFAULT_EVALUATION_WINDOW_DAYS);
  return NextResponse.json({ performance }, { status: 201 });
}
