import { NextRequest, NextResponse } from "next/server";
import { authorizeSupportWorker } from "@/lib/whatsapp/worker-auth";
import { processWhatsAppTriageBatch } from "@/lib/whatsapp/triage-worker";
import { processWhatsAppOutboxBatch } from "@/lib/whatsapp/outbox-worker";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.SUPPORT_WORKER_SECRET?.trim()) {
    return NextResponse.json({ error: "SUPPORT_WORKER_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!authorizeSupportWorker(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({})) as { triageLimit?: number; outboundLimit?: number };
  const triageLimit = boundedInteger(payload.triageLimit, 25, 1, 100);
  const outboundLimit = boundedInteger(payload.outboundLimit, 50, 1, 200);

  const triage = await processWhatsAppTriageBatch(triageLimit);
  const outbound = await processWhatsAppOutboxBatch(outboundLimit);

  return NextResponse.json({ triage, outbound }, { status: 200 });
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
