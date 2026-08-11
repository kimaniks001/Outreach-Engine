import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { createExperiment, listExperiments } from "@/lib/experiments/experiments";
import { schema } from "@/lib/db";

// Experiments are gated under `campaigns` — Strategist drafts, Owner/
// Growth Director review — see docs/PHASE_5_EXPERIMENTS_AND_LEARNING.md.
export async function GET(req: NextRequest) {
  const { user, response } = await requireApiCapability("view", "campaigns");
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const scope = scopeFor(user!.role, "campaigns");
  const experiments = await listExperiments({
    status: (searchParams.get("status") as (typeof schema.experimentStatusEnum.enumValues)[number]) || undefined,
    campaignId: searchParams.get("campaignId") || undefined,
  });
  // "approved" scope (Distribution/Sales) only sees non-DRAFT experiments —
  // same precedent as Phase 3 audience-segment scope filtering.
  const filtered = scope === "approved" ? experiments.filter((e) => e.status !== "DRAFT") : experiments;
  return NextResponse.json({ experiments: filtered });
}

const createSchema = z.object({
  name: z.string().min(1),
  hypothesis: z.string().min(1),
  campaignId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  audienceSegmentId: z.string().uuid().optional(),
  channel: z.enum(schema.channelTypeEnum.enumValues).optional(),
  primaryMetricType: z.enum(schema.conversionTypeEnum.enumValues).optional(),
  primaryMetric: z.string().min(1),
  secondaryMetrics: z.array(z.string()).optional(),
  expectedOutcome: z.string().min(1),
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

  try {
    const experiment = await createExperiment(parsed.data, user!.id);
    return NextResponse.json({ experiment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CREATE_FAILED", message }, { status: 400 });
  }
}
