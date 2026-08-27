import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  selectCommunityActor,
  type CommunityActor,
} from "./community-actor";
import { cookieSecurePayIdentityBridge } from "./securepay-session-cookies";

export type { CommunityActor } from "./community-actor";

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
