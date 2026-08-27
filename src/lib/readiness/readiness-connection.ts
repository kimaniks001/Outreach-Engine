import { cookieSecurePayIdentityBridge } from "@/lib/community/securepay-session-cookies";
import { SecurePayReadinessClient } from "./securepay-readiness-client";

export type ReadinessAuthorityConnection =
  | { status: "CONNECTED"; client: SecurePayReadinessClient }
  | { status: "IDENTITY_UNAVAILABLE"; reason: string }
  | { status: "BASE_URL_UNCONFIGURED"; reason: string };

export async function resolveReadinessAuthorityConnection(
  baseUrl: string | undefined = process.env.SECUREPAY_API_BASE_URL
): Promise<ReadinessAuthorityConnection> {
  const normalizedBaseUrl = baseUrl?.trim();
  if (!normalizedBaseUrl) {
    return { status: "BASE_URL_UNCONFIGURED", reason: "SECUREPAY_API_BASE_URL is not configured" };
  }

  const identity = await cookieSecurePayIdentityBridge.getCurrentIdentity();
  if (!identity) {
    return { status: "IDENTITY_UNAVAILABLE", reason: "No caller-scoped SecurePay identity is connected" };
  }

  return {
    status: "CONNECTED",
    client: new SecurePayReadinessClient({
      baseUrl: normalizedBaseUrl,
      accessToken: identity.accessToken,
    }),
  };
}
