import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getDistributionPlan, updateDistributionPlan, listApprovalHistory } from "@/lib/distribution/plans";
import { listExecutionsForPlan } from "@/lib/distribution/executions";
import { listBudgetHistory } from "@/lib/distribution/budget-guard";
import { CHANNEL_TYPES } from "@/lib/distribution/channels";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "distribution");
  if (response) return response;

  const { id } = await params;
  const plan = await getDistributionPlan(id);
  if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const [executions, approvalHistory, budgetHistory] = await Promise.all([
    listExecutionsForPlan(id),
    listApprovalHistory(id),
    listBudgetHistory(id),
  ]);

  return NextResponse.json({ plan, executions, approvalHistory, budgetHistory });
}

const updateSchema = z.object({
  objective: z.string().min(1).optional(),
  channel: z.enum(CHANNEL_TYPES).optional(),
  channelStrategy: z.string().min(1).optional(),
  creativeVariantIds: z.array(z.string().uuid()).optional(),
  destination: z.string().nullable().optional(),
  cta: z.string().min(1).optional(),
  executionMode: z.enum(["PLAN_ONLY", "SIMULATED", "SANDBOX", "LIVE"]).optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  providerAccountReference: z.string().nullable().optional(),
});

// edit on `distribution` = OWNER + DISTRIBUTION_SALES (approved scope).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("edit", "distribution");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const plan = await updateDistributionPlan(id, parsed.data);
    if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "UPDATE_FAILED", message }, { status: 400 });
  }
}
