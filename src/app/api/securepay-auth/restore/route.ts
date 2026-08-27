import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SecurePayAuthClient, SecurePayAuthError } from "@/lib/community/securepay-auth-client";
import {
  SECUREPAY_KS_HINT_COOKIE,
  SECUREPAY_REFRESH_COOKIE,
} from "@/lib/community/securepay-session-cookies";
import {
  clearSecurePaySessionCookies,
  setSecurePaySessionCookies,
} from "@/lib/community/securepay-session-response";

const SAFE_DESTINATIONS = new Set([
  "/community-live",
  "/community-profile",
  "/circles",
]);

export async function GET(req: NextRequest) {
  const destination = safeDestination(req.nextUrl.searchParams.get("next"));
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(SECUREPAY_REFRESH_COOKIE)?.value?.trim();

  if (!refreshToken) {
    return expiredRedirect(req, destination);
  }

  const baseUrl = process.env.SECUREPAY_API_BASE_URL?.trim();
  if (!baseUrl) {
    return NextResponse.redirect(new URL("/market-login?reason=not-configured", req.url));
  }

  try {
    const client = new SecurePayAuthClient(baseUrl);
    const refreshed = await client.refresh(refreshToken);
    const ksNumber = cookieStore.get(SECUREPAY_KS_HINT_COOKIE)?.value?.trim();
    const response = NextResponse.redirect(new URL(destination, req.url));
    setSecurePaySessionCookies(response, refreshed, ksNumber);
    return response;
  } catch (error) {
    if (error instanceof SecurePayAuthError && error.status === 401) {
      return expiredRedirect(req, destination);
    }
    return NextResponse.redirect(new URL("/market-login?reason=temporarily-unavailable", req.url));
  }
}

function expiredRedirect(req: NextRequest, destination: string): NextResponse {
  const url = new URL("/market-login", req.url);
  url.searchParams.set("reason", "session-expired");
  url.searchParams.set("next", destination);
  const response = NextResponse.redirect(url);
  clearSecurePaySessionCookies(response);
  return response;
}

function safeDestination(raw: string | null): string {
  if (!raw) return "/community-live";
  if (SAFE_DESTINATIONS.has(raw)) return raw;
  if (/^\/circles\/[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return "/community-live";
}
