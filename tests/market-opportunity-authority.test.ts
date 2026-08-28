import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SecurePayMarketRequestError,
  SecurePayPlugMarketClient,
} from "@/lib/market-network/securepay-plug-market-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SecurePay market opportunity authority", () => {
  it("reads caller-scoped opportunities with the bearer token only in headers", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://securepay.test/api/v1/market-network/opportunities");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer caller-token");
      expect(init?.body).toBeUndefined();
      return Response.json([
        {
          offerId: "offer-1",
          title: "Property journey help",
          summary: "Explain the payment journey accurately.",
          requiredProgramCode: "PROPERTY_SPECIALIST",
          publishedAt: "2026-08-28T08:00:00Z",
          closesAt: null,
          myDecision: null,
        },
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SecurePayPlugMarketClient({
      baseUrl: "https://securepay.test/api/v1",
      accessToken: "caller-token",
    });

    const offers = await client.getOpportunities();
    expect(offers).toHaveLength(1);
    expect(offers[0]?.requiredProgramCode).toBe("PROPERTY_SPECIALIST");
  });

  it("records interest without sending the caller token in the decision body", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("/market-network/opportunities/offer-1/decision");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer caller-token");
      expect(String(init?.body)).toBe(JSON.stringify({ decision: "ACCEPTED" }));
      expect(String(init?.body)).not.toContain("caller-token");
      return Response.json({
        offerId: "offer-1",
        title: "Property journey help",
        summary: "Explain the payment journey accurately.",
        requiredProgramCode: "PROPERTY_SPECIALIST",
        publishedAt: "2026-08-28T08:00:00Z",
        closesAt: null,
        myDecision: "ACCEPTED",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SecurePayPlugMarketClient({
      baseUrl: "https://securepay.test/api/v1",
      accessToken: "caller-token",
    });

    const offer = await client.decideOpportunity("offer-1", "ACCEPTED");
    expect(offer.myDecision).toBe("ACCEPTED");
  });

  it.each([404, 409])("preserves SecurePay status %s for privacy/closed handling", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("backend truth", { status }))
    );

    const client = new SecurePayPlugMarketClient({
      baseUrl: "https://securepay.test/api/v1",
      accessToken: "caller-token",
    });

    await expect(client.decideOpportunity("offer-1", "ACCEPTED")).rejects.toMatchObject({
      name: "SecurePayMarketRequestError",
      status,
    } satisfies Partial<SecurePayMarketRequestError>);
  });
});
