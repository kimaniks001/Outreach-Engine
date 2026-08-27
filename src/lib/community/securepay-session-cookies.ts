import { cookies } from "next/headers";
import type { SecurePayIdentityBridge } from "./identity-bridge";

export const SECUREPAY_ACCESS_COOKIE = "outreach_securepay_access";
export const SECUREPAY_REFRESH_COOKIE = "outreach_securepay_refresh";
export const SECUREPAY_KS_HINT_COOKIE = "outreach_securepay_ks_hint";
export const SECUREPAY_PENDING_KS_COOKIE = "outreach_securepay_pending_ks";

/**
 * Reads caller-scoped SecurePay credentials from server-only httpOnly cookies.
 * The access token is passed to SecurePayAPI unchanged; Outreach does not
 * decode it to manufacture identity or role claims.
 */
export const cookieSecurePayIdentityBridge: SecurePayIdentityBridge = {
  async getCurrentIdentity() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(SECUREPAY_ACCESS_COOKIE)?.value?.trim();
    if (!accessToken) return null;

    const ksNumber = cookieStore.get(SECUREPAY_KS_HINT_COOKIE)?.value?.trim();
    return {
      accessToken,
      ...(ksNumber ? { ksNumber } : {}),
    };
  },
};
