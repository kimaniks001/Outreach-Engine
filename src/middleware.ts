import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { SECUREPAY_ACCESS_COOKIE } from "@/lib/community/securepay-session-cookies";

// Edge-runtime middleware. This remains only a fast UX gate. Real staff
// capability checks happen in Node-runtime guards, and Community membership /
// feed authority is enforced by SecurePayAPI using the caller bearer token.

const PUBLIC_PAGE_PATHS = ["/login", "/market-login"];
const PUBLIC_API_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/health"];
const SYSTEM_API_PATHS = ["/api/product-events"];
const SECUREPAY_AUTH_API_PREFIX = "/api/securepay-auth/";

function isCommunityPath(pathname: string): boolean {
  return (
    pathname === "/community-live" ||
    pathname === "/community-profile" ||
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

  if (isCommunityPath(pathname)) {
    if (staffSession || securePayAccessToken) return NextResponse.next();
    return NextResponse.redirect(new URL("/market-login", request.url));
  }

  if (pathname === "/market-login") {
    if (securePayAccessToken) {
      return NextResponse.redirect(new URL("/community-live", request.url));
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
