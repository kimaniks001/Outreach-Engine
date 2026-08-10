import { SignJWT, jwtVerify } from "jose";

// Edge-compatible (jose only) so this module can be used from both
// middleware.ts (Edge runtime) and Node-runtime route handlers/server
// components. No database access happens here — that's current-user.ts.

export const SESSION_COOKIE_NAME = "outreach_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is not set (or too short). Set a random 32+ byte value in .env.local."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .setSubject(payload.userId)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    // Expired, malformed, or invalid signature — treat uniformly as "no session".
    return null;
  }
}
