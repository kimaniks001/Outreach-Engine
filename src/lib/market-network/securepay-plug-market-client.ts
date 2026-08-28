export type PlugMarketStanding =
  | "IN_TRAINING"
  | "READY_TO_ENTER"
  | "ACTIVE"
  | "REFRESH_REQUIRED"
  | "EXITED";

export interface PlugMarketProfile {
  standing: PlugMarketStanding;
  marketReady: boolean;
  enrolled: boolean;
  canRepresentMarket: boolean;
  entryStatementVersion: string;
  enteredAt: string | null;
  exitedAt: string | null;
}

export type OpportunityDecision = "ACCEPTED" | "DECLINED";

export interface MarketOpportunityOffer {
  offerId: string;
  title: string;
  summary: string;
  requiredProgramCode: "MARKET_READY" | "PROPERTY_SPECIALIST";
  publishedAt: string;
  closesAt: string | null;
  myDecision: OpportunityDecision | null;
}

export class SecurePayMarketRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SecurePayMarketRequestError";
  }
}

export class SecurePayPlugMarketClient {
  constructor(
    private readonly options: { baseUrl: string; accessToken: string }
  ) {}

  getProfile(): Promise<PlugMarketProfile> {
    return this.request<PlugMarketProfile>("/market-network/plug/me");
  }

  enterMarket(): Promise<PlugMarketProfile> {
    return this.request<PlugMarketProfile>("/market-network/plug/entry", {
      method: "POST",
      body: JSON.stringify({ acceptMarketParticipation: true }),
    });
  }

  exitMarket(): Promise<PlugMarketProfile> {
    return this.request<PlugMarketProfile>("/market-network/plug/exit", {
      method: "POST",
    });
  }

  getOpportunities(): Promise<MarketOpportunityOffer[]> {
    return this.request<MarketOpportunityOffer[]>("/market-network/opportunities");
  }

  decideOpportunity(
    offerId: string,
    decision: OpportunityDecision
  ): Promise<MarketOpportunityOffer> {
    return this.request<MarketOpportunityOffer>(
      `/market-network/opportunities/${encodeURIComponent(offerId)}/decision`,
      {
        method: "POST",
        body: JSON.stringify({ decision }),
      }
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${this.options.accessToken}`,
        ...init.headers,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new SecurePayMarketRequestError(
        detail || `SecurePay market network request failed (${response.status})`,
        response.status
      );
    }
    return (await response.json()) as T;
  }
}
