export interface SecurePayCommunityIdentity {
  /** SecurePay backend identity id used by MW-07 Community authority. */
  identityId: string;
  /** Optional human-facing KS Number; never used to decide Community authority. */
  ksNumber?: string;
  /** Caller-scoped bearer token. Never replace with an Outreach service token. */
  accessToken: string;
}

/**
 * Boundary between Outreach authentication and SecurePay identity.
 *
 * The current Outreach Engine authenticates internal staff independently.
 * Plugs/Masters should eventually arrive here through SecurePay/KS identity,
 * not through a second parallel identity store invented by Outreach.
 */
export interface SecurePayIdentityBridge {
  getCurrentIdentity(): Promise<SecurePayCommunityIdentity | null>;
}

export class SecurePayIdentityBridgeUnavailableError extends Error {
  constructor() {
    super("SecurePay identity bridge is not connected");
    this.name = "SecurePayIdentityBridgeUnavailableError";
  }
}

/**
 * Explicit placeholder used until the caller-scoped SecurePay session bridge
 * is implemented. It fails closed instead of pretending the current Outreach
 * staff session is a SecurePay Community identity.
 */
export const unavailableSecurePayIdentityBridge: SecurePayIdentityBridge = {
  async getCurrentIdentity() {
    return null;
  },
};
