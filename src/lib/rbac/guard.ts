import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { recordAuditEvent } from "@/lib/audit/log";
import { canAccessSection, type Section } from "./sections";
import { can, type Capability, type Resource } from "./permissions";

// --- Server component / page guards (throw via redirect()) ---

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireSection(section: Section): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canAccessSection(user.role, section)) {
    await recordAuditEvent({
      eventType: "ACCESS_DENIED",
      actorUserId: user.id,
      targetType: "section",
      targetId: section,
      metadata: { role: user.role },
    });
    redirect("/today");
  }
  return user;
}

// --- API route guards (return a NextResponse instead of throwing) ---

export interface ApiAuthResult {
  user: CurrentUser | null;
  response: NextResponse | null;
}

export async function requireApiUser(): Promise<ApiAuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }),
    };
  }
  return { user, response: null };
}

export async function requireApiCapability(
  capability: Capability,
  resource: Resource
): Promise<ApiAuthResult> {
  const { user, response } = await requireApiUser();
  if (response) return { user, response };
  if (!user || !can(user.role, capability, resource)) {
    if (user) {
      await recordAuditEvent({
        eventType: "ACCESS_DENIED",
        actorUserId: user.id,
        targetType: "capability",
        targetId: `${capability}:${resource}`,
        metadata: { role: user.role },
      });
    }
    return {
      user,
      response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export async function requireOwner(): Promise<ApiAuthResult> {
  const { user, response } = await requireApiUser();
  if (response) return { user, response };
  if (!user || user.role !== "OWNER") {
    if (user) {
      await recordAuditEvent({
        eventType: "ACCESS_DENIED",
        actorUserId: user.id,
        targetType: "capability",
        targetId: "owner-only",
        metadata: { role: user.role },
      });
    }
    return {
      user,
      response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    };
  }
  return { user, response: null };
}
