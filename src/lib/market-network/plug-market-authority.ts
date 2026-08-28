import { resolvePlugMarketConnection } from "./plug-market-connection";
import type { PlugMarketProfile } from "./securepay-plug-market-client";

export type PlugMarketAuthorityResult =
  | { status: "CONNECTED"; profile: PlugMarketProfile; reason: string }
  | { status: "UNAVAILABLE"; profile: null; reason: string };

/**
 * Plug identity/market standing is consumed from SecurePay. Outreach never
 * derives Plug status from a Market Ready credential, referral code or social profile.
 */
export async function getPlugMarketAuthority(): Promise<PlugMarketAuthorityResult> {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") {
    return {
      status: "UNAVAILABLE",
      profile: null,
      reason:
        "SecurePay Plug market authority is not connected for this session. Market Ready capability may still be visible, but Outreach will not infer Plug identity.",
    };
  }

  try {
    return {
      status: "CONNECTED",
      profile: await connection.client.getProfile(),
      reason: "Plug market standing is coming from caller-scoped SecurePay backend authority.",
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      profile: null,
      reason:
        "SecurePay Plug market authority did not respond. Outreach will not manufacture an ACTIVE Plug state locally.",
    };
  }
}

export function canRepresentMarket(result: PlugMarketAuthorityResult): boolean {
  return result.status === "CONNECTED" && result.profile.canRepresentMarket === true;
}
