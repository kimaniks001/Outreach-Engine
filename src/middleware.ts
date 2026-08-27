import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import {
  SECUREPAY_ACCESS_COOKIE,
  SECUREPAY_REFRESH_COOKIE,
} from "@/lib/community/securepay-session-names";

// Edge-runtime middleware. This remains only a fast UX gate. Real staff
// capability checks happen in Node-runtime guards, and Community / My Market
// authority is enforced by SecurePayAPI using the caller bearer token.
// Learn / Opportunities / My Market are part of the same market-network shell,
// but a valid session does not itself establish Plug, Market Ready, specialist,
// referral-reward or financial authority.

const PUBLIC_API_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/health"];
const SYSTEM_API_PATHS = ["/api/product-events"];
const SECUREPAY_AUTH_API_PREFIX = "/api/securepay-auth/";

function isCommunityPath(pathname: string): boolean {
  return (
    pathname === "/community-live" ||
    pathname === "/community-profile" ||
    pathname === "/my-market" ||
    pathname === "/learn" ||
    pathname === "/opportunities" ||
    pathname === "/circles" ||
    pathname.startsWith("/circles/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  if (
    PUBLIC_API_PATHS.some((p) => pathname === p) ||
    SYSTEM_API_PATHS.some((p) => pathname === p) ||
    pathname.startsWith(SECUREPAY_AUTH_API_PREFIX)
  ) {
    return NextResponse.next();
  }

  const staffToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const staffSession = staffToken ? await verifySessionToken(staffToken) : null;
  const securePayAccessToken = request.cookies.get(SECUREPAY_ACCESS_COOKIE)?.value;
  const securePayRefreshToken = request.cookies.get(SECUREPAY_REFRESH_COOKIE)?.value;

  if (isCommunityPath(pathname)) {
    if (staffSession || securePayAccessToken) return NextResponse.next();
    if (securePayRefreshToken) {
      const restore = new URL("/api/securepay-auth/restore", request.url);
      restore.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(restore);
    }
    return NextResponse.redirect(new URL("/market-login", request.url));
  }

  if (pathname === "/market-login") {
    if (securePayAccessToken) {
      return NextResponse.redirect(new URL("/community-live", request.url));
    }
    if (securePayRefreshToken) {
      const restore = new URL("/api/securepay-auth/restore", request.url);
      restore.searchParams.set("next", "/community-live");
      return NextResponse.redirect(restore);
    }
    if (staffSession) {
      return NextResponse.redirect(new URL("/today", request.url));
    }
    return NextResponse.next();
  }

  const isPublicPage = pathname === "/login";

  if (!staffSession) {
    if (isPublicPage) return NextResponse.next();
    if (isApiRoute) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicPage) {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
