import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listTouchpoints, recordTouchpoint } from "@/lib/commercial-memory/touchpoints";
import { schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const touchpoints = await listTouchpoints({
    profileId: searchParams.get("profileId") || undefined,
    campaignId: searchParams.get("campaignId") || undefined,
    type: (searchParams.get("type") as (typeof schema.touchpointTypeEnum.enumValues)[number]) || undefined,
  });
  return NextResponse.json({ touchpoints });
}

const createSchema = z.object({
  profileId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  distributionPlanId: z.string().uuid().optional(),
  executionId: z.string().uuid().optional(),
  channel: z.enum(schema.channelTypeEnum.enumValues).optional(),
  type: z.enum(schema.touchpointTypeEnum.enumValues),
  occurredAt: z.string().datetime().optional(),
  externalRef: z.string().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  isDemo: z.boolean().optional(),
});

// edit on `audience` = OWNER only — manual/demo touchpoint entry. Most
// touchpoints are created automatically via product-event ingestion
// (src/lib/product-events/ingest.ts) or Phase 3 distribution executions;
// this is for demo scenarios and campaign-side manual recording (e.g. a
// recorded ad impression/landing-page visit with no product-event
// equivalent).
export async function POST(req: NextRequest) {
  const { response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const touchpoint = await recordTouchpoint({
      ...parsed.data,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
    });
    return NextResponse.json({ touchpoint }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CREATE_FAILED", message }, { status: 400 });
  }
}
