import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireOwner } from "@/lib/rbac/guard";
import { recordAuditEvent } from "@/lib/audit/log";

const bodySchema = z.object({ enabled: z.boolean() });

// Owner-only mutation. Toggling `enabled` never fabricates connectivity —
// docs/MODEL_CONTROL_PLANE.md Section 4 still requires the adapter to exist
// and credentials to be configured before the provider shows AVAILABLE; see
// src/lib/ai/status.ts.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireOwner();
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const rows = await db
    .update(schema.aiProviders)
    .set({ enabled: parsed.data.enabled, updatedAt: new Date() })
    .where(eq(schema.aiProviders.id, id))
    .returning();

  const updated = rows[0];
  if (!updated) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await recordAuditEvent({
    eventType: "PROVIDER_CONFIG_CHANGED",
    actorUserId: user!.id,
    targetType: "ai_provider",
    targetId: updated.id,
    metadata: { key: updated.key, enabled: updated.enabled },
  });

  return NextResponse.json({ ok: true });
}
