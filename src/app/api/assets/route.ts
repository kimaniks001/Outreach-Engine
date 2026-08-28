import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/rbac/guard";
import { releaseMarketAsset, listAssetLibrary } from "@/lib/assets/market-assets";

const releaseSchema = z.object({
  campaignId: z.string().uuid(),
  creativeVariantId: z.string().uuid(),
  kind: z.enum([
    "SOCIAL_POST",
    "WHATSAPP_MESSAGE",
    "POSTER_COPY",
    "FLYER_COPY",
    "VIDEO_SCRIPT",
    "TALKING_POINTS",
  ]),
  locale: z.string().min(2).max(20).optional(),
  usageGuidance: z.string().max(1000).nullable().optional(),
}).strict();

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  if (!["OWNER", "GROWTH_DIRECTOR", "STRATEGIST", "CONTENT_ENGAGEMENT"].includes(user!.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json({ assets: await listAssetLibrary() });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const parsed = releaseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const asset = await releaseMarketAsset(parsed.data, user!.id, user!.role);
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "ASSET_RELEASE_FAILED", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
