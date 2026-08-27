import { canAccessSection } from "@/lib/rbac/sections";
import type { Role } from "@/lib/rbac/roles";
import type { SecurePayCommunityIdentity } from "./identity-bridge";

export interface CommunityStaffUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export type CommunityActor =
  | {
      kind: "STAFF";
      name: string;
      staffUser: CommunityStaffUser;
      securePayIdentity?: SecurePayCommunityIdentity;
    }
  | {
      kind: "SECUREPAY";
      name: string;
      securePayIdentity: SecurePayCommunityIdentity;
    };

/**
 * Pure identity selection rule. It deliberately has no cookie, database,
 * Next.js or React request-cache dependency so the authority boundary can be
 * tested independently of the server runtime.
 *
 * A SecurePay identity is intentionally NOT translated into Plug, Master,
 * moderator, organiser, specialist or any other role here. Those remain
 * separate backend-authoritative states.
 */
export function selectCommunityActor(
  staffUser: CommunityStaffUser | null,
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
