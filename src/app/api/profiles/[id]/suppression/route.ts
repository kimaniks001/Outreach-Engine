import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { applySuppression, removeSuppression, getSuppressionHistory } from "@/lib/commercial-memory/consent";
import { recomputeLifecycle } from "@/lib/commercial-memory/lifecycle";
import { recomputeNextBestAction } from "@/lib/next-best-action/engine";
import { schema } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { id } = await params;
  return NextResponse.json({ suppressionHistory: await getSuppressionHistory(id) });
}

const applySchema = z.object({
  reason: z.enum(schema.suppressionReasonEnum.enumValues),
  source: z.string().min(1),
  reviewDate: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// edit on `audience` = OWNER only. Suppression overrides next-best-action,
// retargeting, and outreach planning everywhere — Phase 4 brief Section
// 21 — so it is recomputed here immediately, not left stale.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = applySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const record = await applySuppression(
      {
        profileId: id,
        reason: parsed.data.reason,
        source: parsed.data.source,
        reviewDate: parsed.data.reviewDate ? new Date(parsed.data.reviewDate) : null,
        notes: parsed.data.notes ?? null,
      },
      user!.id
    );
    await recomputeLifecycle(id);
    await recomputeNextBestAction(id);
    return NextResponse.json({ suppression: record }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "SUPPRESSION_FAILED", message }, { status: 400 });
  }
}

const removeSchema = z.object({ notes: z.string().optional() });

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = removeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const record = await removeSuppression(id, user!.id, parsed.data.notes);
    await recomputeLifecycle(id);
    await recomputeNextBestAction(id);
    return NextResponse.json({ suppression: record });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "SUPPRESSION_REMOVE_FAILED", message }, { status: 400 });
  }
}
