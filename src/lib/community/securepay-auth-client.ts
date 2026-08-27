export interface BeginSecurePayAuthenticationInput {
  ksNumber: string;
  password: string;
  applicationId?: string;
  deviceId?: string;
  sourceIpHash?: string;
}

export interface PendingSecurePayAuthentication {
  challengeToken: string;
  expiresAt: string;
}

export interface CompletedSecurePayAuthentication {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export type RefreshedSecurePaySession = CompletedSecurePayAuthentication;

export class SecurePayAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "SecurePayAuthError";
  }
}

/**
 * Server-side BFF client for the existing SecurePay KS Number + MFA flow.
 * The browser never receives access/refresh tokens from this class directly;
 * Outreach API route handlers store them as httpOnly cookies.
 */
export class SecurePayAuthClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, fetchImpl: typeof fetch = fetch) {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (!normalized) throw new Error("SecurePay API base URL is required");
    this.baseUrl = normalized;
    this.fetchImpl = fetchImpl;
  }

  begin(input: BeginSecurePayAuthenticationInput): Promise<PendingSecurePayAuthentication> {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  complete(challengeToken: string, otpProof: string): Promise<CompletedSecurePayAuthentication> {
    return this.request("/auth/complete", {
      method: "POST",
      body: JSON.stringify({ challengeToken, otpProof }),
    });
  }

  refresh(refreshToken: string): Promise<RefreshedSecurePaySession> {
    return this.request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout(accessToken: string): Promise<void> {
    await this.request<void>("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      let message = "SecurePay authentication failed";
      try {
        const body = (await response.json()) as { message?: unknown; error?: unknown };
        if (typeof body.message === "string") message = body.message;
        else if (typeof body.error === "string") message = body.error;
      } catch {
        // Keep enumeration-safe generic message.
      }
      throw new SecurePayAuthError(response.status, message);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
