import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { generateAndPersistRecommendations, listCurrentRecommendations } from "@/lib/growth-director/engine";

// `analytics` view — Growth Director recommendations are IMPACT/ACTION
// pillar output. See docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md.
export async function GET() {
  const { response } = await requireApiCapability("view", "analytics");
  if (response) return response;

  return NextResponse.json({ recommendations: await listCurrentRecommendations() });
}

const generateSchema = z.object({ useAiNarrative: z.boolean().optional() });

// create on `analytics` = OWNER only under the literal grant table — see
// docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md's RBAC reading decision
// (Growth Director the role has view+approve, never create, anywhere in
// existing doctrine).
export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "analytics");
  if (response) return response;

  const json = await req.json().catch(() => ({}));
  const parsed = generateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const recommendations = await generateAndPersistRecommendations({
    useAiNarrative: parsed.data.useAiNarrative,
    requestedByUserId: user!.id,
    generatedByUserId: user!.id,
  });
  return NextResponse.json({ recommendations }, { status: 201 });
}
