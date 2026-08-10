import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyPassword } from "./password";
import { recordAuditEvent } from "@/lib/audit/log";
import type { Role } from "@/lib/rbac/roles";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type AuthenticateResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; error: "INVALID_CREDENTIALS" | "ACCOUNT_INACTIVE" };

// Deliberately returns the same INVALID_CREDENTIALS error for "no such
// user" and "wrong password" so the API never discloses which emails exist.
export async function authenticateUser(
  email: string,
  plainTextPassword: string
): Promise<AuthenticateResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);
  const user = rows[0];

  if (!user) {
    await recordAuditEvent({
      eventType: "LOGIN_FAILURE",
      actorLabel: normalizedEmail,
      targetType: "user",
      metadata: { reason: "no_such_user" },
    });
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  const passwordMatches = await verifyPassword(plainTextPassword, user.passwordHash);
  if (!passwordMatches) {
    await recordAuditEvent({
      eventType: "LOGIN_FAILURE",
      actorUserId: user.id,
      actorLabel: normalizedEmail,
      targetType: "user",
      targetId: user.id,
      metadata: { reason: "bad_password" },
    });
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  if (!user.active) {
    await recordAuditEvent({
      eventType: "LOGIN_FAILURE",
      actorUserId: user.id,
      actorLabel: normalizedEmail,
      targetType: "user",
      targetId: user.id,
      metadata: { reason: "inactive" },
    });
    return { ok: false, error: "ACCOUNT_INACTIVE" };
  }

  await recordAuditEvent({
    eventType: "LOGIN_SUCCESS",
    actorUserId: user.id,
    actorLabel: normalizedEmail,
    targetType: "user",
    targetId: user.id,
  });

  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}
