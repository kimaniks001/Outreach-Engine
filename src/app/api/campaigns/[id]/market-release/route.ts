import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/rbac/guard";
import { getCurrentMarketRelease, releaseCampaignToMarket } from "@/lib/approvals/market-release";

const releaseSchema = z.object({ notes: z.string().max(2000).optional() }).strict();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { id } = await params;
  const release = await getCurrentMarketRelease(id);
  return NextResponse.json({ currentRelease: release });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  if (user!.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = releaseSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }
  const { id } = await params;
  try {
    const result = await releaseCampaignToMarket(id, user!.id, user!.role, parsed.data.notes);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "RELEASE_FAILED", message: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
}
