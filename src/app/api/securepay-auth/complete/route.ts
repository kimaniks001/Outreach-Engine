import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SecurePayAuthClient, SecurePayAuthError } from "@/lib/community/securepay-auth-client";
import { SECUREPAY_PENDING_KS_COOKIE } from "@/lib/community/securepay-session-cookies";
import {
  clearPendingSecurePayKsCookie,
  setSecurePaySessionCookies,
} from "@/lib/community/securepay-session-response";

const bodySchema = z.object({
  challengeToken: z.string().min(1).max(2048),
  otpProof: z.string().trim().min(1).max(64),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const baseUrl = process.env.SECUREPAY_API_BASE_URL?.trim();
  if (!baseUrl) {
    return NextResponse.json({ error: "SECUREPAY_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const client = new SecurePayAuthClient(baseUrl);
    const completed = await client.complete(parsed.data.challengeToken, parsed.data.otpProof);
    const cookieStore = await cookies();
    const pendingKs = cookieStore.get(SECUREPAY_PENDING_KS_COOKIE)?.value?.trim();

    const response = NextResponse.json({ ok: true });
    setSecurePaySessionCookies(response, completed, pendingKs);
    clearPendingSecurePayKsCookie(response);
    return response;
  } catch (error) {
    if (error instanceof SecurePayAuthError && error.status === 401) {
      return NextResponse.json({ error: "INVALID_MFA" }, { status: 401 });
    }
    if (error instanceof SecurePayAuthError && error.status === 429) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }
    return NextResponse.json({ error: "SECUREPAY_AUTH_UNAVAILABLE" }, { status: 502 });
  }
}
