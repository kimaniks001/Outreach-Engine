import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getCurrentRetargetingEligibility, recordRetargetingEligibility } from "@/lib/next-best-action/retargeting";
import { schema } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { id } = await params;
  return NextResponse.json({ retargetingEligibility: await getCurrentRetargetingEligibility(id) });
}

const evaluateSchema = z.object({
  campaignId: z.string().uuid().optional(),
  channel: z.enum(schema.channelTypeEnum.enumValues).optional(),
});

// edit on `audience` = OWNER only. This only ever records a decision —
// Phase 4 does not automatically launch retargeting (Section 20).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = evaluateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const record = await recordRetargetingEligibility(
      { profileId: id, campaignId: parsed.data.campaignId ?? null, channel: parsed.data.channel ?? null },
      user!.id
    );
    return NextResponse.json({ retargetingEligibility: record }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "EVALUATION_FAILED", message }, { status: 400 });
  }
}
