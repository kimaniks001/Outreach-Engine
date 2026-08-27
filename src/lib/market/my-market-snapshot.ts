import { resolveMarketEconomyAuthorityConnection } from "./authority-connection";
import {
  MarketEconomyAuthorityError,
  totalConfirmedReferralRewardEvidence,
  type ConfirmedRewardEvidenceTotal,
  type ReferralHistoryEvidence,
} from "./referral-authority";

export type MyMarketSnapshot =
  | {
      status: "LIVE";
      ksNumber?: string;
      history: ReferralHistoryEvidence;
      confirmedRewardEvidenceTotal: ConfirmedRewardEvidenceTotal | null;
    }
  | {
      status: "UNAVAILABLE";
      reason: string;
    };

export async function getMyMarketSnapshot(): Promise<MyMarketSnapshot> {
  const connection = await resolveMarketEconomyAuthorityConnection();
  if (connection.status !== "CONNECTED") {
    return {
      status: "UNAVAILABLE",
      reason: connection.reason,
    };
  }

  try {
    const history = await connection.client.getMyReferralHistory();
    return {
      status: "LIVE",
      ksNumber: connection.identity.ksNumber,
      history,
      confirmedRewardEvidenceTotal: totalConfirmedReferralRewardEvidence(history),
    };
  } catch (error) {
    if (error instanceof MarketEconomyAuthorityError) {
      return {
        status: "UNAVAILABLE",
        reason:
          error.code === "UNAUTHENTICATED"
            ? "SecurePay could not authenticate this Market Network session. Sign in again to reload My Market."
            : "SecurePay referral authority is not available to Outreach right now.",
      };
    }
    return {
      status: "UNAVAILABLE",
      reason: "My Market could not load authoritative referral evidence right now.",
    };
  }
}
