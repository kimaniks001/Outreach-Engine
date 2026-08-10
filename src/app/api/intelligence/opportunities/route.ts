import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { listOpportunities } from "@/lib/intelligence/opportunities";

// Owner/Growth Director (raw/full scope) see every opportunity. Strategist
// ("approved" scope) sees only APPROVED opportunities — the
// conclusion-without-raw-source pattern from docs/SOURCE_PROVENANCE.md
// Section 4. Everyone else is forbidden.
export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const scope = scopeFor(user!.role, "intelligence");
  if (scope === "none") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const opportunities =
    scope === "approved" ? await listOpportunities({ status: ["APPROVED"] }) : await listOpportunities();

  return NextResponse.json({ opportunities });
}
