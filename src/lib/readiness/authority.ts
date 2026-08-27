import { resolveReadinessAuthorityConnection } from "./readiness-connection";
import type {
  ReadinessCredential,
  ReadinessProgramCode,
} from "./securepay-readiness-client";

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

const CREDENTIAL_NAMES: Record<ReadinessProgramCode, string> = {
  MARKET_READY: "Market Ready",
  PROPERTY_SPECIALIST: "Property Specialist",
};

/**
 * Connects Outreach's existing readiness seam to caller-scoped SecurePay
 * evidence. This projection deliberately does not manufacture Plug, Master,
 * staff, financial, referral or Community authority from a credential.
 */
export async function getReadinessAuthority(): Promise<ReadinessAuthorityResult> {
  const connection = await resolveReadinessAuthorityConnection();
  if (connection.status !== "CONNECTED") {
    return {
      status: "UNAVAILABLE",
      projection: null,
      reason:
        "Backend Market Ready authority is not connected for this session. Practice checks remain available, but they cannot award or unlock real credentials.",
    };
  }

  try {
    const profile = await connection.client.getProfile();
    const credentials = profile.credentials
      .filter((credential) => credential.earnedVersion !== null)
      .map(toAuthoritativeCredential);

    return {
      status: "CONNECTED",
      projection: {
        source: "BACKEND",
        // MARKET_READY proves current readiness only. It does not itself prove
        // the wider commercial/legal definition of a Plug or Experienced Plug.
        plugStatus: profile.marketReady ? "MARKET_READY" : "IN_TRAINING",
        credentials,
      },
      reason:
        "Market readiness and specialist credential currentness are coming from SecurePay backend evidence for this signed-in identity.",
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      projection: null,
      reason:
        "SecurePay Market Ready authority did not respond. Practice mode is available, but Outreach will not infer or award a credential locally.",
    };
  }
}

function toAuthoritativeCredential(credential: ReadinessCredential): AuthoritativeCredential {
  return {
    credentialId: `${credential.code}:v${credential.earnedVersion}`,
    name: CREDENTIAL_NAMES[credential.code],
    kind: credential.code === "MARKET_READY" ? "READINESS" : "SPECIALIST",
    status: credential.state === "CURRENT" ? "CURRENT" : "REFRESH_REQUIRED",
    awardedAt: credential.issuedAt ?? "",
    evidenceVersion: String(credential.earnedVersion),
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
