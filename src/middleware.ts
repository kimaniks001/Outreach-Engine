import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

// Edge-runtime middleware. Only checks that a session cookie exists and has
// a valid signature — it does NOT do role/capability checks (that requires
// a database lookup, which happens in Node-runtime pages/route handlers via
// src/lib/rbac/guard.ts). This is a UX convenience layer (fast redirect to
// /login), not the authorization boundary — see ADR-003 and
// docs/ACCESS_CONTROL_MODEL.md Section 5.

const PUBLIC_PAGE_PATHS = ["/login"];
const PUBLIC_API_PATHS = ["/api/auth/login", "/api/auth/logout"];

// The product-event ingestion boundary (Phase 4 brief Section 14) accepts
// EITHER an authenticated Owner session OR a shared-secret header for a
// real server-to-server SecurePay integration, which by definition has no
// browser session cookie. It must reach the route handler even with no
// session cookie so src/lib/product-events/auth.ts can perform that real
// check — this is NOT a broader public-API exemption: the route itself
// still rejects any request lacking either credential with 403.
const SYSTEM_API_PATHS = ["/api/product-events"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  if (PUBLIC_API_PATHS.some((p) => pathname === p) || SYSTEM_API_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isPublicPage = PUBLIC_PAGE_PATHS.includes(pathname);

  if (!session) {
    if (isPublicPage) return NextResponse.next();
    if (isApiRoute) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && isPublicPage) {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
