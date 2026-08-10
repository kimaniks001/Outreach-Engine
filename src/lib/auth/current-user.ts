import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";
import type { Role } from "@/lib/rbac/roles";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

// Memoized per request (React `cache`) so multiple server components/route
// handlers checking the current user within one request only hit the
// database once. Always re-reads the user row (not just the JWT) so a role
// change or deactivation takes effect immediately — see
// docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md "Session model".
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      active: schema.users.active,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  const user = rows[0];
  if (!user || !user.active) return null;

  return user as CurrentUser;
});
