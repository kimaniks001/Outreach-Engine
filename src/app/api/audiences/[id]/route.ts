import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { getAudienceSegment, getAudienceScore, updateAudienceSegment } from "@/lib/audience/segments";
import { ProhibitedTargetingError } from "@/lib/audience/targeting-guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { id } = await params;
  const segment = await getAudienceSegment(id);
  if (!segment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const score = await getAudienceScore(id);
  return NextResponse.json({ segment, score });
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  sector: z.string().nullable().optional(),
  geography: z.string().nullable().optional(),
  businessCriteria: z.string().nullable().optional(),
  roleFunctionCriteria: z.string().nullable().optional(),
  companyCriteria: z.string().nullable().optional(),
  intentCriteria: z.string().nullable().optional(),
  channelEligibility: z.array(z.string()).optional(),
  estimatedReach: z.string().nullable().optional(),
});

// edit on `audience` = OWNER only, per the literal grant table.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const segment = await updateAudienceSegment(id, parsed.data);
    if (!segment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ segment });
  } catch (err) {
    if (err instanceof ProhibitedTargetingError) {
      return NextResponse.json({ error: "PROHIBITED_TARGETING", message: err.message, findings: err.findings }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "UPDATE_FAILED", message }, { status: 400 });
  }
}
