export type ReadinessProgramCode = "MARKET_READY" | "PROPERTY_SPECIALIST";
export type ReadinessCredentialState = "NOT_EARNED" | "CURRENT" | "REFRESH_DUE";

export type ReadinessQuestion = {
  id: string;
  prompt: string;
  options: string[];
};

export type ReadinessProgram = {
  code: ReadinessProgramCode;
  version: number;
  title: string;
  description: string;
  passScore: number;
  prerequisite: ReadinessProgramCode | null;
  questions: ReadinessQuestion[];
};

export type ReadinessCredential = {
  code: ReadinessProgramCode;
  currentVersion: number;
  earnedVersion: number | null;
  state: ReadinessCredentialState;
  issuedAt: string | null;
};

export type ReadinessProfile = {
  marketReady: boolean;
  credentials: ReadinessCredential[];
};

export type ReadinessAttempt = {
  id: string;
  programCode: ReadinessProgramCode;
  programVersion: number;
  score: number;
  totalQuestions: number;
  passed: boolean;
  attemptedAt: string;
};

export class SecurePayReadinessClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(input: { baseUrl: string; accessToken: string }) {
    this.baseUrl = input.baseUrl.replace(/\/$/, "");
    this.accessToken = input.accessToken;
  }

  listPrograms(): Promise<ReadinessProgram[]> {
    return this.request<ReadinessProgram[]>("/market-readiness/programs");
  }

  getProfile(): Promise<ReadinessProfile> {
    return this.request<ReadinessProfile>("/market-readiness/me");
  }

  submitAttempt(programCode: ReadinessProgramCode, answers: Record<string, string>): Promise<ReadinessAttempt> {
    return this.request<ReadinessAttempt>(`/market-readiness/programs/${programCode}/attempts`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${this.accessToken}`,
        ...init.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SecurePay readiness request failed (${response.status})${text ? `: ${text}` : ""}`);
    }

    return (await response.json()) as T;
  }
}
