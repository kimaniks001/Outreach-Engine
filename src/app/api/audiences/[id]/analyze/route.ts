import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { classifyAudienceSegment } from "@/lib/audience/segments";

// create on `audience` = OWNER only. Mirrors
// src/app/api/intelligence/signals/[id]/analyze/route.ts's shape.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("create", "audience");
  if (response) return response;

  const { id } = await params;

  try {
    const result = await classifyAudienceSegment(id, user!.id);
    if (!result.ok) {
      if ("rejected" in result) {
        return NextResponse.json({ error: "PROHIBITED_TARGETING", message: result.reason }, { status: 422 });
      }
      // Malformed/unavailable AI output is rejected safely — no segment
      // field is mutated. Surface the reason for a retry.
      return NextResponse.json({ error: "CLASSIFICATION_FAILED", result: result.result }, { status: 422 });
    }
    return NextResponse.json({ segment: result.segment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CLASSIFICATION_ERROR", message }, { status: 400 });
  }
}
