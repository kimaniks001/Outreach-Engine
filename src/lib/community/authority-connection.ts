import { SecurePayCommunityClient } from "./securepay-community-client";
import {
  unavailableSecurePayIdentityBridge,
  type SecurePayCommunityIdentity,
  type SecurePayIdentityBridge,
} from "./identity-bridge";

export type CommunityAuthorityConnection =
  | {
      status: "CONNECTED";
      identity: SecurePayCommunityIdentity;
      client: SecurePayCommunityClient;
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
 * Resolves the real Community authority only when BOTH sides of the bridge
 * exist: a configured SecurePay API base URL and the current caller's
 * SecurePay identity/token. Otherwise this fails closed and Community LIVE
 * must remain in clearly-labelled prototype mode.
 */
export async function resolveCommunityAuthorityConnection(
  identityBridge: SecurePayIdentityBridge = unavailableSecurePayIdentityBridge,
  baseUrl: string | undefined = process.env.SECUREPAY_API_BASE_URL
): Promise<CommunityAuthorityConnection> {
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
    client: new SecurePayCommunityClient({
      baseUrl: normalizedBaseUrl,
      accessToken: identity.accessToken,
    }),
  };
}
