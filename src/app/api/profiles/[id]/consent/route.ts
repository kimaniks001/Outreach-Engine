import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { recordConsent, getConsentHistory } from "@/lib/commercial-memory/consent";
import { schema } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiCapability("view", "audience");
  if (response) return response;

  const { id } = await params;
  return NextResponse.json({ consentHistory: await getConsentHistory(id) });
}

const consentSchema = z.object({
  channel: z.enum(schema.channelTypeEnum.enumValues).nullable().optional(),
  status: z.enum(schema.consentStatusEnum.enumValues),
  legalBasis: z.string().nullable().optional(),
  source: z.string().min(1),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// edit on `audience` = OWNER only. Doctrine (Phase 4 brief Section 21):
// registration/product use is never itself a consent event — this is the
// ONLY code path that writes a consent_records row.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiCapability("edit", "audience");
  if (response) return response;

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = consentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const record = await recordConsent(
      {
        profileId: id,
        channel: parsed.data.channel ?? null,
        status: parsed.data.status,
        legalBasis: parsed.data.legalBasis ?? null,
        source: parsed.data.source,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        notes: parsed.data.notes ?? null,
      },
      user!.id
    );
    return NextResponse.json({ consent: record }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "CONSENT_UPDATE_FAILED", message }, { status: 400 });
  }
}
