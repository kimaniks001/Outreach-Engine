import { cookies } from "next/headers";
import type { SecurePayIdentityBridge } from "./identity-bridge";
import {
  SECUREPAY_ACCESS_COOKIE,
  SECUREPAY_KS_HINT_COOKIE,
} from "./securepay-session-names";

export {
  SECUREPAY_ACCESS_COOKIE,
  SECUREPAY_REFRESH_COOKIE,
  SECUREPAY_KS_HINT_COOKIE,
  SECUREPAY_PENDING_KS_COOKIE,
} from "./securepay-session-names";

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
