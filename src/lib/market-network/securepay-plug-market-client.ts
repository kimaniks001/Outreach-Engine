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

export type CustomerMarketRequestType =
  | "GENERAL_SECUREPAY_HELP"
  | "PROPERTY_JOURNEY_HELP";

export type CustomerMarketRequestStatus = "OPEN" | "SELECTED" | "CANCELLED";

export interface CustomerMarketRequest {
  requestId: string;
  requestType: CustomerMarketRequestType;
  status: CustomerMarketRequestStatus;
  offerId: string;
  title: string;
  summary: string;
  requiredProgramCode: "MARKET_READY" | "PROPERTY_SPECIALIST";
  interestedCount: number;
  createdAt: string;
  cancelledAt: string | null;
}

export interface InterestedMarketCandidate {
  candidateRef: string;
  interestedAt: string;
}

export interface CustomerMarketSelection {
  selectionRef: string;
  requestId: string;
  candidateRef: string;
  selectedAt: string;
}

export interface CustomerPlugRelationship {
  relationshipRef: string;
  requestId: string;
  requestType: CustomerMarketRequestType;
  status: "ACTIVE";
  openedAt: string;
  contactExchangeAvailable: boolean;
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

/**
 * SecurePay Market Network bearer client.
 *
 * Outreach is a consumer only: it does not infer identity, capability, selection,
 * relationship, referral, agreement or financial authority from these responses.
 */
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

  createCustomerRequest(
    requestType: CustomerMarketRequestType,
    idempotencyKey: string
  ): Promise<CustomerMarketRequest> {
    return this.request<CustomerMarketRequest>("/market-network/customer-requests", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ requestType }),
    });
  }

  getMyCustomerRequests(limit = 50, offset = 0): Promise<CustomerMarketRequest[]> {
    return this.request<CustomerMarketRequest[]>(
      `/market-network/customer-requests/mine?limit=${limit}&offset=${offset}`
    );
  }

  getInterestedCandidates(
    requestId: string,
    limit = 50,
    offset = 0
  ): Promise<InterestedMarketCandidate[]> {
    return this.request<InterestedMarketCandidate[]>(
      `/market-network/customer-requests/${encodeURIComponent(requestId)}/candidates?limit=${limit}&offset=${offset}`
    );
  }

  getCustomerSelection(requestId: string): Promise<CustomerMarketSelection> {
    return this.request<CustomerMarketSelection>(
      `/market-network/customer-requests/${encodeURIComponent(requestId)}/selection`
    );
  }

  selectCustomerCandidate(
    requestId: string,
    candidateRef: string
  ): Promise<CustomerMarketSelection> {
    return this.request<CustomerMarketSelection>(
      `/market-network/customer-requests/${encodeURIComponent(requestId)}/selection`,
      {
        method: "POST",
        body: JSON.stringify({ candidateRef }),
      }
    );
  }

  cancelCustomerRequest(requestId: string): Promise<CustomerMarketRequest> {
    return this.request<CustomerMarketRequest>(
      `/market-network/customer-requests/${encodeURIComponent(requestId)}/cancel`,
      { method: "POST" }
    );
  }

  openCustomerRelationship(requestId: string): Promise<CustomerPlugRelationship> {
    return this.request<CustomerPlugRelationship>(
      `/market-network/customer-requests/${encodeURIComponent(requestId)}/relationship`,
      { method: "POST" }
    );
  }

  getCustomerRelationship(requestId: string): Promise<CustomerPlugRelationship> {
    return this.request<CustomerPlugRelationship>(
      `/market-network/customer-requests/${encodeURIComponent(requestId)}/relationship`
    );
  }

  getPlugRelationships(limit = 50, offset = 0): Promise<CustomerPlugRelationship[]> {
    return this.request<CustomerPlugRelationship[]>(
      `/market-network/plug/relationships?limit=${limit}&offset=${offset}`
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Bearer ${this.options.accessToken}`);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers,
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
