import { NextRequest, NextResponse } from "next/server";
import { ingestWhatsAppMessage } from "@/lib/whatsapp/intake";
import { normalizeWhatsAppWebhook, verifyMetaWebhookSignature, verifyWebhookChallenge } from "@/lib/whatsapp/protocol";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "";
  const challenge = verifyWebhookChallenge(req.nextUrl.searchParams, verifyToken);
  if (!challenge) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() ?? "";
  if (!appSecret) {
    return NextResponse.json({ error: "WHATSAPP_WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!verifyMetaWebhookSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as unknown;
  const messages = normalizeWhatsAppWebhook(payload);
  const outcomes = [];
  for (const message of messages) {
    outcomes.push(await ingestWhatsAppMessage(message));
  }

  // Meta retries on non-2xx responses, so valid signed callbacks are acknowledged
  // after idempotent persistence even when they contain only status callbacks.
  return NextResponse.json({ received: messages.length, outcomes }, { status: 200 });
}
