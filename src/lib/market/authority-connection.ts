import type {
  SecurePayCommunityIdentity,
  SecurePayIdentityBridge,
} from "@/lib/community/identity-bridge";
import { cookieSecurePayIdentityBridge } from "@/lib/community/securepay-session-cookies";
import { SecurePayReferralClient } from "./securepay-referral-client";

export type MarketEconomyAuthorityConnection =
  | {
      status: "CONNECTED";
      identity: SecurePayCommunityIdentity;
      client: SecurePayReferralClient;
    }
  | {
      status: "IDENTITY_BRIDGE_UNAVAILABLE";
      reason: string;
    }
  | {
      status: "BASE_URL_UNCONFIGURED";
      reason: string;
    };

/**
 * My Market is self-scoped SecurePay truth. We connect only when both the
 * SecurePay API root and the current caller's bearer identity are available.
 * Staff login by itself is never enough to read somebody's referral market.
 */
export async function resolveMarketEconomyAuthorityConnection(
  identityBridge: SecurePayIdentityBridge = cookieSecurePayIdentityBridge,
  baseUrl: string | undefined = process.env.SECUREPAY_API_BASE_URL
): Promise<MarketEconomyAuthorityConnection> {
  const normalizedBaseUrl = baseUrl?.trim();
  if (!normalizedBaseUrl) {
    return {
      status: "BASE_URL_UNCONFIGURED",
      reason: "SECUREPAY_API_BASE_URL is not configured",
    };
  }

  const identity = await identityBridge.getCurrentIdentity();
  if (!identity) {
    return {
      status: "IDENTITY_BRIDGE_UNAVAILABLE",
      reason: "No caller-scoped SecurePay identity is connected to this Outreach session",
    };
  }

  return {
    status: "CONNECTED",
    identity,
    client: new SecurePayReferralClient({
      baseUrl: normalizedBaseUrl,
      accessToken: identity.accessToken,
    }),
  };
}
