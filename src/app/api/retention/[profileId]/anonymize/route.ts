import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { anonymizeProfile, LegalHoldError } from "@/lib/commercial-memory/retention";

const bodySchema = z.object({ reason: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { user, response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const { profileId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const action = await anonymizeProfile(profileId, user!.id, parsed.data.reason);
    return NextResponse.json({ action }, { status: 201 });
  } catch (err) {
    if (err instanceof LegalHoldError) {
      return NextResponse.json({ error: "LEGAL_HOLD_BLOCKED", message: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "ANONYMIZE_FAILED", message }, { status: 400 });
  }
}
