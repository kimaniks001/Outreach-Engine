import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/rbac/guard";
import { revokeMarketAsset } from "@/lib/assets/market-assets";

const revokeSchema = z.object({ reason: z.string().min(3).max(1000) }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const parsed = revokeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const { id } = await params;
    const asset = await revokeMarketAsset(id, user!.id, user!.role, parsed.data.reason);
    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json(
      { error: "ASSET_REVOKE_FAILED", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
