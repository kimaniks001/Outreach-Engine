import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getCampaign, updateCampaignStrategy, listApprovalHistory, listBrandReviews } from "@/lib/campaigns/campaigns";
import { listVariantsForCampaign } from "@/lib/creative/variants";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "campaigns");
  if (response) return response;

  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const [variants, approvalHistory, brandReviews] = await Promise.all([
    listVariantsForCampaign(id),
    listApprovalHistory("campaign", id),
    listBrandReviews("campaign", id),
  ]);

  return NextResponse.json({ campaign, variants, approvalHistory, brandReviews });
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  objective: z.string().min(1).optional(),
  targetAudience: z.string().min(1).optional(),
  positioningAngle: z.string().min(1).optional(),
  coreMessage: z.string().min(1).optional(),
  recommendedChannelTypes: z.array(z.string()).optional(),
  cta: z.string().min(1).optional(),
  destinationConcept: z.string().optional(),
  creativeBrief: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("edit", "campaigns");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const campaign = await updateCampaignStrategy(id, parsed.data);
  if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ campaign });
}
