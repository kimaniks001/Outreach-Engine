import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SecurePayAuthClient } from "@/lib/community/securepay-auth-client";
import { SECUREPAY_ACCESS_COOKIE } from "@/lib/community/securepay-session-cookies";
import { clearSecurePaySessionCookies } from "@/lib/community/securepay-session-response";

export async function POST() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(SECUREPAY_ACCESS_COOKIE)?.value?.trim();
  const baseUrl = process.env.SECUREPAY_API_BASE_URL?.trim();

  if (accessToken && baseUrl) {
    try {
      await new SecurePayAuthClient(baseUrl).logout(accessToken);
    } catch {
      // Local logout still succeeds. A dead/expired upstream token must not trap
      // a person inside an Outreach browser session.
    }
  }

  const response = NextResponse.json({ ok: true });
  clearSecurePaySessionCookies(response);
  return response;
}
