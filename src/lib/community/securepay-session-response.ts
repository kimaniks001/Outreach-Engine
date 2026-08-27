import type { NextResponse } from "next/server";
import {
  SECUREPAY_ACCESS_COOKIE,
  SECUREPAY_KS_HINT_COOKIE,
  SECUREPAY_PENDING_KS_COOKIE,
  SECUREPAY_REFRESH_COOKIE,
} from "./securepay-session-cookies";

export interface SecurePayTokenSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

const common = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function setSecurePaySessionCookies(
  response: NextResponse,
  session: SecurePayTokenSession,
  ksNumber?: string
) {
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

export function clearSecurePaySessionCookies(response: NextResponse) {
  for (const name of [
    SECUREPAY_ACCESS_COOKIE,
    SECUREPAY_REFRESH_COOKIE,
    SECUREPAY_KS_HINT_COOKIE,
    SECUREPAY_PENDING_KS_COOKIE,
  ]) {
    response.cookies.set(name, "", { ...common, maxAge: 0 });
  }
}

export function clearPendingSecurePayKsCookie(response: NextResponse) {
  response.cookies.set(SECUREPAY_PENDING_KS_COOKIE, "", { ...common, maxAge: 0 });
}

function safeDate(value: string, fallbackMs: number): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(Date.now() + fallbackMs) : parsed;
}
