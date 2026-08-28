import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { createClaimSource, listClaimSources } from "@/lib/approvals/market-release";

const createSchema = z.object({
  sourceKey: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  sourceType: z.enum(["DOCTRINE", "TERMS", "PRICING", "PRODUCT_AUTHORITY", "LEGAL_APPROVAL", "POLICY", "OTHER"]),
  version: z.string().min(1).max(80),
  sourceReference: z.string().min(1).max(1000),
  contentDigest: z.string().min(1).max(200).nullable().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveUntil: z.string().datetime().nullable().optional(),
}).strict();

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  if (!can(user!.role, "view", "campaigns") && user!.role !== "OWNER") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json({ sources: await listClaimSources() });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  if (user!.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }
  try {
    const source = await createClaimSource(
      {
        ...parsed.data,
        effectiveFrom: parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : null,
        effectiveUntil: parsed.data.effectiveUntil ? new Date(parsed.data.effectiveUntil) : null,
      },
      user!.id,
      user!.role
    );
    return NextResponse.json({ source }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "CREATE_FAILED", message: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}
