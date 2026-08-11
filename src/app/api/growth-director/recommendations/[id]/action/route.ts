import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/rbac/guard";
import { actionRecommendation } from "@/lib/growth-director/approval";

// The action bridge — OWNER-only. Only ever prepares downstream work
// (drafts, or the safe "pause" direction) — see
// src/lib/growth-director/approval.ts::actionRecommendation.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireOwner();
  if (response) return response;

  const { id } = await params;
  try {
    const outcome = await actionRecommendation(id, user!.id);
    return NextResponse.json({ outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "ACTION_FAILED", message }, { status: 400 });
  }
}
