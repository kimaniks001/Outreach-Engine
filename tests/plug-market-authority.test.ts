import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canRepresentMarket,
  type PlugMarketAuthorityResult,
} from "@/lib/market-network/plug-market-authority";
import { SecurePayPlugMarketClient } from "@/lib/market-network/securepay-plug-market-client";
import {
  authoritativeOpportunityEligible,
  type AuthoritativeReadinessProjection,
} from "@/lib/readiness/authority";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SecurePayPlugMarketClient", () => {
  it("propagates the caller bearer token without putting it in the body", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer caller-token");
      expect(String(init?.body ?? "")).not.toContain("caller-token");
      return Response.json({
        standing: "READY_TO_ENTER",
        marketReady: true,
        enrolled: false,
        canRepresentMarket: false,
        entryStatementVersion: "MARKET_NETWORK_V1",
        enteredAt: null,
        exitedAt: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SecurePayPlugMarketClient({
      baseUrl: "https://securepay.test/api/v1",
      accessToken: "caller-token",
    });
    await client.getProfile();
  });
});

describe("Plug market authority boundaries", () => {
  const readiness: AuthoritativeReadinessProjection = {
    source: "BACKEND",
    marketReadinessStatus: "MARKET_READY",
    credentials: [
      {
        credentialId: "MARKET_READY:v1",
        name: "Market Ready",
        kind: "READINESS",
        status: "CURRENT",
        awardedAt: "2026-08-28T06:00:00Z",
        evidenceVersion: "1",
      },
    ],
  };

  it("Market Ready capability alone does not create Plug representation", () => {
    expect(authoritativeOpportunityEligible(readiness, ["Market Ready"])).toBe(true);

    const market: PlugMarketAuthorityResult = {
      status: "CONNECTED",
      reason: "backend",
      profile: {
        standing: "READY_TO_ENTER",
        marketReady: true,
        enrolled: false,
        canRepresentMarket: false,
        entryStatementVersion: "MARKET_NETWORK_V1",
        enteredAt: null,
        exitedAt: null,
      },
    };

    expect(canRepresentMarket(market)).toBe(false);
  });

  it("only backend ACTIVE representation projects as representable", () => {
    const market: PlugMarketAuthorityResult = {
      status: "CONNECTED",
      reason: "backend",
      profile: {
        standing: "ACTIVE",
        marketReady: true,
        enrolled: true,
        canRepresentMarket: true,
        entryStatementVersion: "MARKET_NETWORK_V1",
        enteredAt: "2026-08-28T07:00:00Z",
        exitedAt: null,
      },
    };

    expect(canRepresentMarket(market)).toBe(true);
  });

  it("REFRESH_REQUIRED and unavailable authority fail closed", () => {
    const refreshRequired: PlugMarketAuthorityResult = {
      status: "CONNECTED",
      reason: "backend",
      profile: {
        standing: "REFRESH_REQUIRED",
        marketReady: false,
        enrolled: true,
        canRepresentMarket: false,
        entryStatementVersion: "MARKET_NETWORK_V1",
        enteredAt: "2026-08-28T07:00:00Z",
        exitedAt: null,
      },
    };
    const unavailable: PlugMarketAuthorityResult = {
      status: "UNAVAILABLE",
      profile: null,
      reason: "not connected",
    };

    expect(canRepresentMarket(refreshRequired)).toBe(false);
    expect(canRepresentMarket(unavailable)).toBe(false);
  });
});
