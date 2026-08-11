import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { listActiveBudgetPolicies, setBudgetPolicy } from "@/lib/ai/budget";
import { schema } from "@/lib/db";

export async function GET() {
  const { response } = await requireApiCapability("view", "model-config");
  if (response) return response;

  return NextResponse.json({ policies: await listActiveBudgetPolicies() });
}

const setSchema = z.object({
  scope: z.enum(schema.budgetPolicyScopeEnum.enumValues),
  scopeRef: z.string().optional(),
  periodType: z.enum(schema.budgetPeriodEnum.enumValues),
  softLimitUsd: z.number().min(0).optional(),
  hardLimitUsd: z.number().min(0).optional(),
  notes: z.string().optional(),
});

// create on `model-config` = OWNER only.
export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "model-config");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = setSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.scope !== "GLOBAL" && !parsed.data.scopeRef) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: "scopeRef is required for every scope except GLOBAL." }, { status: 400 });
  }

  const policy = await setBudgetPolicy(parsed.data, user!.id);
  return NextResponse.json({ policy }, { status: 201 });
}
