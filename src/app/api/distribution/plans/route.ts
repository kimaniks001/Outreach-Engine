import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { createDistributionPlan, listDistributionPlans } from "@/lib/distribution/plans";
import { CHANNEL_TYPES } from "@/lib/distribution/channels";

export async function GET() {
  const { response } = await requireApiCapability("view", "distribution");
  if (response) return response;

  const plans = await listDistributionPlans();
  return NextResponse.json({ plans });
}

const createSchema = z.object({
  campaignId: z.string().uuid(),
  audienceSegmentId: z.string().uuid(),
  objective: z.string().min(1),
  channel: z.enum(CHANNEL_TYPES),
  channelStrategy: z.string().min(1),
  creativeVariantIds: z.array(z.string().uuid()).optional(),
  destination: z.string().optional(),
  cta: z.string().min(1),
  plannedBudget: z.number().nonnegative().optional(),
  budgetCurrency: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  providerAccountReference: z.string().optional(),
});

// create on `distribution` = OWNER + DISTRIBUTION_SALES (approved scope —
// enforced in the service layer, which requires an APPROVED audience
// segment), per the literal docs/ACCESS_CONTROL_MODEL.md Section 4 grant.
export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "distribution");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const plan = await createDistributionPlan(parsed.data, user!.id);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CREATE_FAILED", message }, { status: 400 });
  }
}
