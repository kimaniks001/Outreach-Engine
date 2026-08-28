import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolvePlugMarketConnection } from "@/lib/market-network/plug-market-connection";
import { recordMarketInsight } from "@/lib/market-learning/market-learning";

const schema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(3000),
  tags: z.array(z.string().max(80)).max(12).optional(),
  rapidResponseReason: z.enum(["MISINFORMATION", "CONFUSION", "MARKET_OPPORTUNITY"]).nullable().optional(),
}).strict();

export async function POST(req: NextRequest) {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") {
    return NextResponse.json(
      { error: "SecurePay Plug market authority is not available for this session", authorityStatus: connection.status },
      { status: 503 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    // Deliberately do not persist Plug KSNumber/contact identity into the
    // market-signal record. The connected SecurePay boundary authorises the
    // session; Outreach stores the field observation, not a marketing profile.
    const signal = await recordMarketInsight({ source: "PLUG", ...parsed.data });
    return NextResponse.json({ signal }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "MARKET_INSIGHT_REJECTED", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 422 }
    );
  }
}
