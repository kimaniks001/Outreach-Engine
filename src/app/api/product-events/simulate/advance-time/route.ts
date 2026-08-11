import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiCapability } from "@/lib/rbac/guard";
import { simulateElapsedTime } from "@/lib/product-events/simulator";

const advanceSchema = z.object({ hoursElapsed: z.number().min(1).max(24 * 30) });

// Demo-only helper: simulates time passing so abandoned-journey detection
// can be demonstrated without waiting in real time — Phase 4 brief
// Sections 16/31/32. Never mutates stored timestamps; it evaluates
// abandonment against a shifted "now" (src/lib/journeys/abandonment.ts).
// create on `audience` = OWNER only.
export async function POST(req: NextRequest) {
  const { response } = await requireApiCapability("create", "audience");
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = advanceSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.issues }, { status: 400 });
  }

  const affectedProfileIds = await simulateElapsedTime(parsed.data.hoursElapsed);
  return NextResponse.json({ simulated: true, abandonedJourneyProfileIds: affectedProfileIds });
}
