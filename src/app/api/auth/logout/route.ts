import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recordAuditEvent } from "@/lib/audit/log";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    await recordAuditEvent({
      eventType: "LOGOUT",
      actorUserId: user.id,
      targetType: "user",
      targetId: user.id,
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
