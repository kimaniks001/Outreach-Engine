import { cookieSecurePayIdentityBridge } from "@/lib/community/securepay-session-cookies";
import { SecurePaySupportContextClient } from "@/lib/trader-support/securepay-support-context-client";

export type SupportContextConnection =
  | { status: "CONNECTED"; client: SecurePaySupportContextClient }
  | { status: "IDENTITY_UNAVAILABLE"; reason: string }
  | { status: "BASE_URL_UNCONFIGURED"; reason: string };

/**
 * Reuses the request-scoped SecurePay identity bridge. The connected identity must separately hold
 * backend SUPPORT_CONTEXT_READ authority; being an Outreach staff user alone is never enough.
 */
export async function resolveSupportContextConnection(
  baseUrl: string | undefined = process.env.SECUREPAY_API_BASE_URL
): Promise<SupportContextConnection> {
  const normalizedBaseUrl = baseUrl?.trim();
  if (!normalizedBaseUrl) {
    return { status: "BASE_URL_UNCONFIGURED", reason: "SecurePay support context is not configured" };
  }

  let identity;
  try {
    identity = await cookieSecurePayIdentityBridge.getCurrentIdentity();
  } catch {
    return { status: "IDENTITY_UNAVAILABLE", reason: "SecurePay support identity is unavailable" };
  }

  if (!identity) {
    return { status: "IDENTITY_UNAVAILABLE", reason: "SecurePay support identity is unavailable" };
  }

  return {
    status: "CONNECTED",
    client: new SecurePaySupportContextClient({
      baseUrl: normalizedBaseUrl,
      accessToken: identity.accessToken,
    }),
  };
}
