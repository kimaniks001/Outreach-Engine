import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { createLearning, listLearnings } from "@/lib/learning/learnings";
import { schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { response } = await requireApiCapability("view", "campaigns");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const learnings = await listLearnings({
    status: (searchParams.get("status") as (typeof schema.learningStatusEnum.enumValues)[number]) || undefined,
    applicableChannel: (searchParams.get("channel") as (typeof schema.channelTypeEnum.enumValues)[number]) || undefined,
    applicableSector: searchParams.get("sector") || undefined,
  });
  return NextResponse.json({ learnings });
}

const createSchema = z.object({
  sourceExperimentId: z.string().uuid().optional(),
  sourceCampaignId: z.string().uuid().optional(),
  sourceOpportunityId: z.string().uuid().optional(),
  observation: z.string().min(1),
  conclusion: z.string().min(1),
  evidence: z.record(z.unknown()).optional(),
  confidence: z.enum(schema.evidenceConfidenceEnum.enumValues),
  applicableAudienceSegmentId: z.string().uuid().optional(),
  applicableSector: z.string().optional(),
  applicableChannel: z.enum(schema.channelTypeEnum.enumValues).optional(),
  applicableProduct: z.string().optional(),
  reviewAfter: z.string().datetime().optional(),
  isDemo: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "campaigns");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const learning = await createLearning(
    { ...parsed.data, reviewAfter: parsed.data.reviewAfter ? new Date(parsed.data.reviewAfter) : null },
    user!.id
  );
  return NextResponse.json({ learning }, { status: 201 });
}
