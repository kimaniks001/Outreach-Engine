import { SecurePaySupportContextClient } from "@/lib/trader-support/securepay-support-context-client";

/**
 * Server-side identity for automated support reads only.
 *
 * The configured bearer must represent a dedicated SecurePay service/support
 * principal with SUPPORT_CONTEXT_READ and no transaction/mutation authority.
 * If it is missing, WhatsApp automation fails closed to a human queue.
 */
export function resolveAutomatedSupportContextClient(): SecurePaySupportContextClient | null {
  const baseUrl = process.env.SECUREPAY_API_BASE_URL?.trim();
  const accessToken = process.env.SECUREPAY_AUTOMATED_SUPPORT_TOKEN?.trim();
  if (!baseUrl || !accessToken) return null;
  return new SecurePaySupportContextClient({ baseUrl, accessToken });
}
