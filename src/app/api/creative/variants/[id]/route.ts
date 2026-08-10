import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db, schema } from "@/lib/db";
import { getVariant } from "@/lib/creative/variants";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  if (!can(user!.role, "view", "campaigns") && !can(user!.role, "view", "content")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const variant = await getVariant(id);
  if (!variant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ variant });
}

const updateSchema = z.object({
  headline: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  cta: z.string().min(1).optional(),
  imageConcept: z.string().min(1).optional(),
  rationale: z.string().min(1).optional(),
});

// Creative copy editing = `content` resource, edit capability — Owner and
// Content & Engagement only (Strategist has view-only on content; they edit
// campaign strategy, not creative copy, per the Phase 0 grant table).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  if (!can(user!.role, "edit", "content")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const [variant] = await db
    .update(schema.creativeVariants)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.creativeVariants.id, id))
    .returning();

  if (!variant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ variant });
}
