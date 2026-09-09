import { NextRequest, NextResponse } from "next/server";
import {
  applyWhatsAppIdentityBindingAssertion,
  parseWhatsAppIdentityBindingAssertion,
  verifySecurePayBindingSignature,
} from "@/lib/whatsapp/identity-binding";

export const runtime = "nodejs";

const MAX_ASSERTION_BODY_BYTES = 8 * 1024;
const SIGNATURE_HEADER = "x-securepay-signature-256";

export async function POST(req: NextRequest) {
  const secret = process.env.SECUREPAY_CHANNEL_BINDING_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    return noStore({ error: "CHANNEL_BINDING_NOT_CONFIGURED" }, 503);
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_ASSERTION_BODY_BYTES) {
    return noStore({ error: "PAYLOAD_TOO_LARGE" }, 413);
  }

  if (!verifySecurePayBindingSignature(rawBody, req.headers.get(SIGNATURE_HEADER), secret)) {
    return noStore({ error: "UNAUTHORIZED" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return noStore({ error: "INVALID_JSON" }, 400);
  }

  let assertion;
  try {
    assertion = parseWhatsAppIdentityBindingAssertion(payload);
  } catch {
    return noStore({ error: "INVALID_ASSERTION" }, 400);
  }

  const result = await applyWhatsAppIdentityBindingAssertion(assertion);
  const status = result.status === "IDENTITY_MISMATCH" || result.status === "REBIND_REQUIRES_REVOKE" ? 409 : 200;
  return noStore({ assertionId: assertion.assertionId, ...result }, status);
}

function noStore(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
