import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { runVariantBrandGuardian } from "@/lib/creative/variants";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  if (!can(user!.role, "edit", "campaigns") && !can(user!.role, "edit", "content")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const outcome = await runVariantBrandGuardian(id, user!.id);
    return NextResponse.json({ outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "BRAND_GUARDIAN_FAILED", message }, { status: 400 });
  }
}
