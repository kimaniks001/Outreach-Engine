import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { canAccessSection } from "@/lib/rbac/sections";
import type { SecurePayCommunityIdentity } from "./identity-bridge";
import { cookieSecurePayIdentityBridge } from "./securepay-session-cookies";

export type CommunityActor =
  | {
      kind: "STAFF";
      name: string;
      staffUser: CurrentUser;
      securePayIdentity?: SecurePayCommunityIdentity;
    }
  | {
      kind: "SECUREPAY";
      name: string;
      securePayIdentity: SecurePayCommunityIdentity;
    };

/**
 * Pure selection rule used by the request resolver and tests.
 *
 * Important: a SecurePay identity is intentionally NOT translated into Plug,
 * Master, moderator, organiser, specialist or any other role here. Those are
 * separate backend-authoritative states.
 */
export function selectCommunityActor(
  staffUser: CurrentUser | null,
  securePayIdentity: SecurePayCommunityIdentity | null
): CommunityActor | null {
  if (staffUser && canAccessSection(staffUser.role, "COMMUNITY_LIVE")) {
    return {
      kind: "STAFF",
      name: staffUser.name,
      staffUser,
      ...(securePayIdentity ? { securePayIdentity } : {}),
    };
  }

  if (securePayIdentity) {
    return {
      kind: "SECUREPAY",
      name: securePayIdentity.ksNumber || "SecurePay member",
      securePayIdentity,
    };
  }

  return null;
}

export async function getCurrentCommunityActor(): Promise<CommunityActor | null> {
  const [staffUser, securePayIdentity] = await Promise.all([
    getCurrentUser(),
    cookieSecurePayIdentityBridge.getCurrentIdentity(),
  ]);
  return selectCommunityActor(staffUser, securePayIdentity);
}

export async function requireCommunityActor(): Promise<CommunityActor> {
  const actor = await getCurrentCommunityActor();
  if (!actor) redirect("/market-login");
  return actor;
}
