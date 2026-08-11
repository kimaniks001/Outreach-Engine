import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { createAudienceSegment, listAudienceSegments } from "@/lib/audience/segments";
import { ProhibitedTargetingError } from "@/lib/audience/targeting-guard";

export async function GET() {
  const { user, response } = await requireApiCapability("view", "audience");
  if (response) return response;

  // "approved" scope roles (STRATEGIST, DISTRIBUTION_SALES) only ever see
  // APPROVED segments, matching the Phase 2 opportunity-scope precedent —
  // docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md's RBAC reading decision.
  const scope = scopeFor(user!.role, "audience");
  const segments = await listAudienceSegments(scope === "approved" ? { status: ["APPROVED"] } : {});
  return NextResponse.json({ segments });
}

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  linkedCampaignId: z.string().uuid(),
  sector: z.string().optional(),
  geography: z.string().optional(),
  businessCriteria: z.string().optional(),
  roleFunctionCriteria: z.string().optional(),
  companyCriteria: z.string().optional(),
  intentCriteria: z.string().optional(),
  channelEligibility: z.array(z.string()).optional(),
  estimatedReach: z.string().optional(),
});

// create on `audience` = OWNER only, per the literal
// docs/ACCESS_CONTROL_MODEL.md Section 4 grant table — see
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md's RBAC reading decision.
export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "audience");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const segment = await createAudienceSegment(parsed.data, user!.id);
    return NextResponse.json({ segment }, { status: 201 });
  } catch (err) {
    if (err instanceof ProhibitedTargetingError) {
      return NextResponse.json({ error: "PROHIBITED_TARGETING", message: err.message, findings: err.findings }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CREATE_FAILED", message }, { status: 400 });
  }
}
