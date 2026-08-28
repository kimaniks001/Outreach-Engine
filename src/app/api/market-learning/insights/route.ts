import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { recordMarketInsight } from "@/lib/market-learning/market-learning";

const schema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(3000),
  tags: z.array(z.string().max(80)).max(12).optional(),
  rapidResponseReason: z.enum(["MISINFORMATION", "CONFUSION", "MARKET_OPPORTUNITY"]).nullable().optional(),
  isDemo: z.boolean().optional(),
}).strict();

export async function POST(req: NextRequest) {
  // Raw intelligence creation remains governed by the existing grant table.
  // This does not create a new staff-side bypass for feedback intake.
  const { user, response } = await requireApiCapability("create", "intelligence");
  if (response) return response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const signal = await recordMarketInsight({ source: "STAFF", ...parsed.data }, user!.id);
    return NextResponse.json({ signal }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "MARKET_INSIGHT_REJECTED", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 422 }
    );
  }
}
