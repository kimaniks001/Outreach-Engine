import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { proposeBudget, approveBudget, getCurrentBudget, BudgetNotApprovedError } from "@/lib/distribution/budget-guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "distribution");
  if (response) return response;

  const { id } = await params;
  const budget = await getCurrentBudget(id);
  return NextResponse.json({ budget });
}

const proposeSchema = z.object({
  plannedBudget: z.number().nonnegative(),
  currency: z.string().min(1),
  dailyCap: z.number().nonnegative().nullable().optional(),
  totalCap: z.number().nonnegative().nullable().optional(),
  providerAccountReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// create/edit on `distribution` = OWNER + DISTRIBUTION_SALES (approved
// scope) may propose a budget; only OWNER may approve one (see PATCH).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "distribution");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = proposeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const budget = await proposeBudget({ distributionPlanId: id, ...parsed.data }, user!.id);
    return NextResponse.json({ budget }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "PROPOSE_FAILED", message }, { status: 400 });
  }
}

const approveSchema = z.object({
  approvedBudget: z.number().nonnegative().optional(),
});

// approve on `distribution` = OWNER only, per the literal grant table — see
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md's RBAC reading decision.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("approve", "distribution");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = approveSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const budget = await approveBudget(id, user!.id, parsed.data.approvedBudget);
    return NextResponse.json({ budget });
  } catch (err) {
    if (err instanceof BudgetNotApprovedError) {
      return NextResponse.json({ error: "NO_PENDING_PROPOSAL", message: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "APPROVE_FAILED", message }, { status: 400 });
  }
}
