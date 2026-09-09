import { NextRequest, NextResponse } from "next/server";
import { authorizeSupportWorker } from "@/lib/whatsapp/worker-auth";
import { processWhatsAppTriageBatch } from "@/lib/whatsapp/triage-worker";
import { processWhatsAppOutboxBatch } from "@/lib/whatsapp/outbox-worker";
import {
  planSupportDrain,
  readSupportRuntimeHealth,
  recoverStaleSupportWork,
  supportHealthState,
} from "@/lib/whatsapp/runtime-health";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authError = authorize(req);
  if (authError) return authError;
  const health = await readSupportRuntimeHealth();
  return NextResponse.json({ health, state: supportHealthState(health), plan: planSupportDrain(health) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const authError = authorize(req);
  if (authError) return authError;

  const payload = await req.json().catch(() => ({})) as {
    triageLimit?: number;
    outboundLimit?: number;
    maxCycles?: number;
  };
  const explicitTriage = optionalBoundedInteger(payload.triageLimit, 1, 100);
  const explicitOutbound = optionalBoundedInteger(payload.outboundLimit, 1, 200);
  const maxCycles = boundedInteger(payload.maxCycles, 2, 1, 5);

  const recovery = await recoverStaleSupportWork();
  const before = await readSupportRuntimeHealth();
  const cycles: Array<{
    pressure: "NORMAL" | "ELEVATED" | "HIGH";
    triage: { claimed: number; completed: number; failed: number };
    outbound: { claimed: number; sent: number; failed: number };
  }> = [];

  let snapshot = before;
  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const plan = planSupportDrain(snapshot);
    const triageLimit = explicitTriage ?? plan.triageLimit;
    const outboundLimit = explicitOutbound ?? plan.outboundLimit;

    const triage = await processWhatsAppTriageBatch(triageLimit);
    const outbound = await processWhatsAppOutboxBatch(outboundLimit);
    cycles.push({ pressure: plan.pressure, triage, outbound });

    if (triage.claimed === 0 && outbound.claimed === 0) break;
    snapshot = await readSupportRuntimeHealth();
    if (snapshot.triageReady === 0 && snapshot.outboxReady === 0) break;
  }

  const after = await readSupportRuntimeHealth();
  return NextResponse.json({
    recovery,
    before,
    stateBefore: supportHealthState(before),
    cycles,
    after,
    stateAfter: supportHealthState(after),
    hasMore: after.triageReady > 0 || after.outboxReady > 0,
  }, { status: 200 });
}

function authorize(req: NextRequest): NextResponse | null {
  if (!process.env.SUPPORT_WORKER_SECRET?.trim()) {
    return NextResponse.json({ error: "SUPPORT_WORKER_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!authorizeSupportWorker(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}

function optionalBoundedInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return optionalBoundedInteger(value, min, max) ?? fallback;
}
