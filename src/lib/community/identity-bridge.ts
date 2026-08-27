export interface SecurePayCommunityIdentity {
  /**
   * SecurePay backend identity id when an identity/profile projection is available.
   * The Community API itself derives identity from the bearer token, so Outreach
   * must not decode or invent this value merely to call MW-07.
   */
  identityId?: string;
  /** Optional human-facing KS Number. Display hint only; never Community authority. */
  ksNumber?: string;
  /** Caller-scoped bearer token. Never replace with an Outreach service token. */
  accessToken: string;
}

/**
 * Boundary between Outreach authentication and SecurePay identity.
 *
 * Internal staff continue to use Outreach staff auth. Market-network people
 * enter through SecurePay/KS identity rather than a second Outreach password
 * store. Community authority is always derived by SecurePay from this token.
 */
export interface SecurePayIdentityBridge {
  getCurrentIdentity(): Promise<SecurePayCommunityIdentity | null>;
}

export const unavailableSecurePayIdentityBridge: SecurePayIdentityBridge = {
  async getCurrentIdentity() {
    return null;
  },
};
