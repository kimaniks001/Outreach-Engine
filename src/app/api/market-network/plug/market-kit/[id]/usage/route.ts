import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolvePlugMarketConnection } from "@/lib/market-network/plug-market-connection";
import { recordMarketKitUsage } from "@/lib/market-learning/market-learning";

const schema = z.object({
  action: z.enum(["VIEWED", "SHARED", "PERSONALISED", "PRINTED", "USED_IN_CONVERSATION"]),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") {
    return NextResponse.json(
      { error: "SecurePay Plug market authority is not available for this session", authorityStatus: connection.status },
      { status: 503 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });

  const { id } = await params;
  try {
    const result = await recordMarketKitUsage({
      assetId: id,
      action: parsed.data.action,
      source: "PLUG_MARKET_KIT",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "MARKET_KIT_USAGE_REJECTED", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 422 }
    );
  }
}
