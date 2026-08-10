import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { getOpportunity, getOpportunityScore } from "@/lib/intelligence/opportunities";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const scope = scopeFor(user!.role, "intelligence");
  if (scope === "none") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const opportunity = await getOpportunity(id);
  if (!opportunity) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Strategist ("approved" scope) may only see opportunities that have
  // already been approved — not drafts or ones still under review.
  if (scope === "approved" && opportunity.status !== "APPROVED") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const score = await getOpportunityScore(id);
  return NextResponse.json({ opportunity, score });
}
