import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/rbac/guard";
import { scopeFor } from "@/lib/rbac/permissions";
import { getSignal } from "@/lib/intelligence/signals";
import { listEvidenceForSignal, isManualUnverified } from "@/lib/intelligence/evidence";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const scope = scopeFor(user!.role, "intelligence");
  if (scope !== "raw" && scope !== "full") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const signal = await getSignal(id);
  if (!signal) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const evidence = await listEvidenceForSignal(id);
  const manualUnverified = await isManualUnverified(id);

  return NextResponse.json({ signal, evidence, manualUnverified });
}
