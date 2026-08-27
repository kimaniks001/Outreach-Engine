import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SecurePayAuthClient, SecurePayAuthError } from "@/lib/community/securepay-auth-client";
import { SECUREPAY_PENDING_KS_COOKIE } from "@/lib/community/securepay-session-cookies";

const bodySchema = z.object({
  ksNumber: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256),
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
    const pending = await client.begin({
      ksNumber: parsed.data.ksNumber,
      password: parsed.data.password,
      applicationId: process.env.SECUREPAY_OUTREACH_APPLICATION_ID || undefined,
    });

    const response = NextResponse.json({
      challengeToken: pending.challengeToken,
      expiresAt: pending.expiresAt,
    });
    response.cookies.set(SECUREPAY_PENDING_KS_COOKIE, parsed.data.ksNumber, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: safeDate(pending.expiresAt, 10 * 60 * 1000),
    });
    return response;
  } catch (error) {
    if (error instanceof SecurePayAuthError) {
      if (error.status === 401) {
        return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
      }
      if (error.status === 429) {
        return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
      }
    }
    return NextResponse.json({ error: "SECUREPAY_AUTH_UNAVAILABLE" }, { status: 502 });
  }
}

function safeDate(value: string, fallbackMs: number): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(Date.now() + fallbackMs) : parsed;
}
