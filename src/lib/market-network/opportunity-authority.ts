import { resolvePlugMarketConnection } from "./plug-market-connection";
import type { MarketOpportunityOffer } from "./securepay-plug-market-client";

export type OpportunityAuthorityResult =
  | { status: "CONNECTED"; offers: MarketOpportunityOffer[]; reason: string }
  | { status: "UNAVAILABLE"; offers: []; reason: string };

/**
 * Opportunity visibility is backend-authorized. Outreach does not derive offer
 * visibility from local credentials, Community activity, popularity or demo data.
 */
export async function getOpportunityAuthority(): Promise<OpportunityAuthorityResult> {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") {
    return {
      status: "UNAVAILABLE",
      offers: [],
      reason: "SecurePay opportunity authority is not connected for this session.",
    };
  }

  try {
    return {
      status: "CONNECTED",
      offers: await connection.client.getOpportunities(),
      reason: "These opportunities are caller-scoped projections from SecurePay backend authority.",
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      offers: [],
      reason: "SecurePay opportunity authority did not respond. Demo previews remain non-actionable.",
    };
  }
}
