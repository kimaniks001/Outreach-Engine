import {
  MarketEconomyAuthorityError,
  type MarketEconomyAuthorityErrorCode,
  type ReferralAuthorityPort,
  type ReferralHistoryEvidence,
} from "./referral-authority";

export interface SecurePayReferralClientOptions {
  baseUrl: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * Caller-scoped adapter to SecurePay's self-scoped referral history.
 * There is deliberately no service-token fallback: the backend derives the
 * referrer from the caller bearer token and returns only that caller's market.
 */
export class SecurePayReferralClient implements ReferralAuthorityPort {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SecurePayReferralClientOptions) {
    const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
    const accessToken = options.accessToken.trim();

    if (!baseUrl) throw new Error("SecurePay referral baseUrl is required");
    if (!accessToken) throw new Error("Caller-scoped SecurePay accessToken is required");

    this.baseUrl = baseUrl;
    this.accessToken = accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getMyReferralHistory(): Promise<ReferralHistoryEvidence> {
    const response = await this.fetchImpl(`${this.baseUrl}/referrals/me/history`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw await toMarketAuthorityError(response);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new MarketEconomyAuthorityError(
        "UPSTREAM_ERROR",
        response.status,
        "SecurePay referral authority returned a non-JSON response"
      );
    }

    return (await response.json()) as ReferralHistoryEvidence;
  }
}

async function toMarketAuthorityError(response: Response): Promise<MarketEconomyAuthorityError> {
  const code = mapStatus(response.status);
  let upstreamMessage = "";

  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof body.message === "string") upstreamMessage = body.message;
    else if (typeof body.error === "string") upstreamMessage = body.error;
  } catch {
    // Status is enough for a safe caller-facing failure.
  }

  const safeMessage =
    response.status === 404
      ? "Referral market not found"
      : upstreamMessage || `SecurePay referral authority returned HTTP ${response.status}`;

  return new MarketEconomyAuthorityError(code, response.status, safeMessage);
}

function mapStatus(status: number): MarketEconomyAuthorityErrorCode {
  switch (status) {
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    default:
      return "UPSTREAM_ERROR";
  }
}
