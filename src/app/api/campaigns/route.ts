import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { createCampaignFromOpportunity, listCampaigns } from "@/lib/campaigns/campaigns";

export async function GET() {
  const { response } = await requireApiCapability("view", "campaigns");
  if (response) return response;

  const campaigns = await listCampaigns();
  return NextResponse.json({ campaigns });
}

const createSchema = z.object({
  opportunityId: z.string().uuid(),
  name: z.string().min(1),
  objective: z.string().min(1),
  targetAudience: z.string().min(1),
  positioningAngle: z.string().min(1),
  coreMessage: z.string().min(1),
  recommendedChannelTypes: z.array(z.string()).optional(),
  cta: z.string().min(1),
  destinationConcept: z.string().optional(),
  creativeBrief: z.string().optional(),
});

// create on campaigns = Owner + Strategist per docs/ACCESS_CONTROL_MODEL.md
// Section 4. The service layer additionally enforces the opportunity must
// already be APPROVED.
export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "campaigns");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const campaign = await createCampaignFromOpportunity(parsed.data, user!.id);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CREATE_FAILED", message }, { status: 400 });
  }
}
