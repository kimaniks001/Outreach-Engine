import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, requireApiCapability } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { createSignal, listSignalsWithEvidenceCount } from "@/lib/intelligence/signals";
import { schema } from "@/lib/db";

// Raw intelligence (signals + evidence) is only visible to roles with
// "raw" or "full" scope on the intelligence resource (Owner, Growth
// Director) — Strategist's "approved" scope only covers opportunity
// conclusions, per docs/SOURCE_PROVENANCE.md Section 4. See
// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md for the full reasoning.
export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const scope = scopeFor(user!.role, "intelligence");
  if (scope !== "raw" && scope !== "full") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const rows = await listSignalsWithEvidenceCount();
  return NextResponse.json({ signals: rows });
}

const createSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  signalType: z.enum(schema.signalTypeEnum.enumValues),
  publishedAt: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  isDemo: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiCapability("create", "intelligence");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const signal = await createSignal(
    {
      ...parsed.data,
      publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : null,
    },
    user!.id
  );

  return NextResponse.json({ signal }, { status: 201 });
}
