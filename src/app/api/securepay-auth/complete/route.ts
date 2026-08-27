import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SecurePayAuthClient, SecurePayAuthError } from "@/lib/community/securepay-auth-client";
import {
  SECUREPAY_ACCESS_COOKIE,
  SECUREPAY_KS_HINT_COOKIE,
  SECUREPAY_PENDING_KS_COOKIE,
  SECUREPAY_REFRESH_COOKIE,
} from "@/lib/community/securepay-session-cookies";

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
    setSessionCookies(response, completed, pendingKs);
    response.cookies.set(SECUREPAY_PENDING_KS_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
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

function setSessionCookies(
  response: NextResponse,
  session: {
    accessToken: string;
    accessTokenExpiresAt: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
  },
  ksNumber?: string
) {
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };

  response.cookies.set(SECUREPAY_ACCESS_COOKIE, session.accessToken, {
    ...common,
    expires: safeDate(session.accessTokenExpiresAt, 15 * 60 * 1000),
  });
  response.cookies.set(SECUREPAY_REFRESH_COOKIE, session.refreshToken, {
    ...common,
    expires: safeDate(session.refreshTokenExpiresAt, 24 * 60 * 60 * 1000),
  });
  if (ksNumber) {
    response.cookies.set(SECUREPAY_KS_HINT_COOKIE, ksNumber, {
      ...common,
      expires: safeDate(session.refreshTokenExpiresAt, 24 * 60 * 60 * 1000),
    });
  }
}

function safeDate(value: string, fallbackMs: number): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(Date.now() + fallbackMs) : parsed;
}
