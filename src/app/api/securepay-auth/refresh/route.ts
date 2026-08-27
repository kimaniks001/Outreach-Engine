import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SecurePayAuthClient, SecurePayAuthError } from "@/lib/community/securepay-auth-client";
import {
  SECUREPAY_KS_HINT_COOKIE,
  SECUREPAY_REFRESH_COOKIE,
} from "@/lib/community/securepay-session-cookies";
import {
  clearSecurePaySessionCookies,
  setSecurePaySessionCookies,
} from "@/lib/community/securepay-session-response";

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(SECUREPAY_REFRESH_COOKIE)?.value?.trim();
  if (!refreshToken) {
    return NextResponse.json({ error: "NO_SECUREPAY_SESSION" }, { status: 401 });
  }

  const baseUrl = process.env.SECUREPAY_API_BASE_URL?.trim();
  if (!baseUrl) {
    return NextResponse.json({ error: "SECUREPAY_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const client = new SecurePayAuthClient(baseUrl);
    const refreshed = await client.refresh(refreshToken);
    const ksNumber = cookieStore.get(SECUREPAY_KS_HINT_COOKIE)?.value?.trim();
    const response = NextResponse.json({ ok: true });
    setSecurePaySessionCookies(response, refreshed, ksNumber);
    return response;
  } catch (error) {
    if (error instanceof SecurePayAuthError && error.status === 401) {
      const response = NextResponse.json({ error: "SECUREPAY_SESSION_EXPIRED" }, { status: 401 });
      clearSecurePaySessionCookies(response);
      return response;
    }
    return NextResponse.json({ error: "SECUREPAY_AUTH_UNAVAILABLE" }, { status: 502 });
  }
}
