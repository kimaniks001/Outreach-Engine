import { cookieSecurePayIdentityBridge } from "@/lib/community/securepay-session-cookies";
import { SecurePayPlugMarketClient } from "./securepay-plug-market-client";

export type PlugMarketConnection =
  | { status: "CONNECTED"; client: SecurePayPlugMarketClient }
  | { status: "IDENTITY_UNAVAILABLE"; reason: string }
  | { status: "BASE_URL_UNCONFIGURED"; reason: string };

export async function resolvePlugMarketConnection(
  baseUrl: string | undefined = process.env.SECUREPAY_API_BASE_URL
): Promise<PlugMarketConnection> {
  const normalizedBaseUrl = baseUrl?.trim();
  if (!normalizedBaseUrl) {
    return {
      status: "BASE_URL_UNCONFIGURED",
      reason: "SECUREPAY_API_BASE_URL is not configured",
    };
  }

  let identity;
  try {
    identity = await cookieSecurePayIdentityBridge.getCurrentIdentity();
  } catch {
    return {
      status: "IDENTITY_UNAVAILABLE",
      reason: "No request-scoped SecurePay identity context is available",
    };
  }

  if (!identity) {
    return {
      status: "IDENTITY_UNAVAILABLE",
      reason: "No caller-scoped SecurePay identity is connected",
    };
  }

  return {
    status: "CONNECTED",
    client: new SecurePayPlugMarketClient({
      baseUrl: normalizedBaseUrl,
      accessToken: identity.accessToken,
    }),
  };
}
