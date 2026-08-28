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
      throw new Error(detail || `SecurePay market entry request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }
}
