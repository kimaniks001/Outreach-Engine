import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, requireOwner } from "@/lib/rbac/guard";
import { getSafeMode, setSafeMode } from "@/lib/safe-mode/state";

const bodySchema = z.object({ mode: z.enum(["NORMAL", "SAFE_MODE"]) });

export async function GET() {
  const { response } = await requireApiUser();
  if (response) return response;

  const mode = await getSafeMode();
  return NextResponse.json({ mode });
}

// Owner-only, per docs/AUDIT_AND_CONTROL.md Section 4.
export async function POST(req: NextRequest) {
  const { user, response } = await requireOwner();
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  await setSafeMode(parsed.data.mode, user!.id);
  return NextResponse.json({ ok: true, mode: parsed.data.mode });
}
