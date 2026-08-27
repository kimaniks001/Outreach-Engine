import { afterEach, describe, expect, it, vi } from "vitest";
import { SecurePayReadinessClient } from "@/lib/readiness/securepay-readiness-client";
import {
  authoritativeOpportunityEligible,
  hasCurrentCredential,
  type AuthoritativeReadinessProjection,
} from "@/lib/readiness/authority";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SecurePayReadinessClient", () => {
  it("propagates the caller bearer token and never puts it in the request body", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer caller-token");
      expect(String(init?.body)).not.toContain("caller-token");
      return Response.json({ marketReady: false, credentials: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SecurePayReadinessClient({
      baseUrl: "https://securepay.test/api/v1",
      accessToken: "caller-token",
    });
    await client.getProfile();
  });
});

describe("readiness capability boundaries", () => {
  const projection: AuthoritativeReadinessProjection = {
    source: "BACKEND",
    plugStatus: "MARKET_READY",
    credentials: [
      {
        credentialId: "MARKET_READY:v1",
        name: "Market Ready",
        kind: "READINESS",
        status: "CURRENT",
        awardedAt: "2026-08-27T12:00:00Z",
        evidenceVersion: "1",
      },
      {
        credentialId: "PROPERTY_SPECIALIST:v1",
        name: "Property Specialist",
        kind: "SPECIALIST",
        status: "REFRESH_REQUIRED",
        awardedAt: "2026-08-27T12:00:00Z",
        evidenceVersion: "1",
      },
    ],
  };

  it("requires CURRENT credential evidence", () => {
    expect(hasCurrentCredential(projection, "Market Ready")).toBe(true);
    expect(hasCurrentCredential(projection, "Property Specialist")).toBe(false);
  });

  it("does not unlock an opportunity from stale specialist evidence", () => {
    expect(authoritativeOpportunityEligible(projection, ["Market Ready", "Property Specialist"])).toBe(false);
  });

  it("fails closed without backend projection", () => {
    expect(authoritativeOpportunityEligible(null, ["Market Ready"])).toBe(false);
  });
});
