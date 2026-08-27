export type ReadinessAuthorityStatus = "CONNECTED" | "UNAVAILABLE";

export interface AuthoritativeCredential {
  credentialId: string;
  name: string;
  kind: "READINESS" | "SPECIALIST";
  status: "CURRENT" | "REFRESH_REQUIRED" | "SUSPENDED" | "REVOKED";
  awardedAt: string;
  validThrough?: string;
  evidenceVersion: string;
}

export interface AuthoritativeReadinessProjection {
  source: "BACKEND";
  plugStatus: "NOT_A_PLUG" | "IN_TRAINING" | "MARKET_READY" | "EXPERIENCED";
  credentials: AuthoritativeCredential[];
}

export interface ReadinessAuthorityResult {
  status: ReadinessAuthorityStatus;
  projection: AuthoritativeReadinessProjection | null;
  reason: string;
}

/**
 * There is deliberately no live implementation yet.
 *
 * SecurePayAPI currently has no Plug/readiness credential contract for Outreach
 * to consume. Returning UNAVAILABLE is safer than translating Community
 * membership, a KS identity, demo training progress, time served or staff
 * opinion into a real market qualification.
 */
export async function getReadinessAuthority(): Promise<ReadinessAuthorityResult> {
  return {
    status: "UNAVAILABLE",
    projection: null,
    reason:
      "Backend Plug/readiness authority is not available yet. Prototype checks may be explored, but they cannot award or unlock real credentials.",
  };
}

export function hasCurrentCredential(
  projection: AuthoritativeReadinessProjection | null,
  credentialName: string
): boolean {
  if (!projection) return false;
  return projection.credentials.some(
    (credential) => credential.name === credentialName && credential.status === "CURRENT"
  );
}

export function authoritativeOpportunityEligible(
  projection: AuthoritativeReadinessProjection | null,
  requirements: string[]
): boolean {
  if (!projection) return false;
  return requirements.every((requirement) => hasCurrentCredential(projection, requirement));
}
