import { afterEach, describe, expect, it, vi } from "vitest";
import {
  customerMarketRequestChoices,
  customerRequestMeaning,
  marketRelationshipBoundary,
} from "@/lib/market-network/customer-market-foundation";
import {
  CANDIDATE_PAGE_SIZE,
  mergeCandidatePage,
  upsertCustomerRequest,
} from "@/lib/market-network/customer-market-ui-state";
import {
  SecurePayMarketRequestError,
  SecurePayPlugMarketClient,
} from "@/lib/market-network/securepay-plug-market-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Phase 6 customer market doctrine", () => {
  it("allows only the two SecurePay-owned help request types", () => {
    expect(customerMarketRequestChoices.map((choice) => choice.type)).toEqual([
      "GENERAL_SECUREPAY_HELP",
      "PROPERTY_JOURNEY_HELP",
    ]);
  });

  it("keeps interest, selection and relationship separate from referral and money authority", () => {
    expect(customerRequestMeaning("OPEN").means.toLowerCase()).toContain("interest");
    expect(customerRequestMeaning("OPEN").means.toLowerCase()).toContain("not assignment");
    expect(customerRequestMeaning("SELECTED").next.toLowerCase()).toContain("open the relationship");
    expect(marketRelationshipBoundary.explanation.toLowerCase()).toContain("does not create referral");
    expect(marketRelationshipBoundary.explanation).toContain("10% share");
    expect(marketRelationshipBoundary.contactClosed.toLowerCase()).toContain("will not reveal or infer");
  });

  it("keeps a successfully created request visible without duplicating it", () => {
    const created = {
      requestId: "request-id",
      requestType: "GENERAL_SECUREPAY_HELP" as const,
      status: "OPEN" as const,
      offerId: "offer-id",
      title: "SecurePay help requested",
      summary: "A customer is asking for general SecurePay help.",
      requiredProgramCode: "MARKET_READY" as const,
      interestedCount: 0,
      createdAt: "2026-09-01T05:00:00Z",
      cancelledAt: null,
    };

    expect(upsertCustomerRequest([], created)).toEqual([created]);
    expect(upsertCustomerRequest([created], { ...created, interestedCount: 2 })).toEqual([
      { ...created, interestedCount: 2 },
    ]);
  });

  it("merges candidate pages and keeps a load-more path past the first 50", () => {
    const firstPage = Array.from({ length: CANDIDATE_PAGE_SIZE }, (_, index) => ({
      candidateRef: `candidate-${index}`,
      interestedAt: "2026-09-01T05:00:00Z",
    }));
    const first = mergeCandidatePage(undefined, firstPage, 0, 75);

    expect(first.items).toHaveLength(50);
    expect(first.nextOffset).toBe(50);
    expect(first.hasMore).toBe(true);

    const second = mergeCandidatePage(
      first,
      Array.from({ length: 25 }, (_, index) => ({
        candidateRef: `candidate-${index + 50}`,
        interestedAt: "2026-09-01T05:01:00Z",
      })),
      first.nextOffset,
      75
    );

    expect(second.items).toHaveLength(75);
    expect(second.nextOffset).toBe(75);
    expect(second.hasMore).toBe(false);
  });
});

describe("SecurePayPlugMarketClient customer journey", () => {
  it("creates a request with only server taxonomy plus idempotency authority", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(init?.method).toBe("POST");
      expect(headers.get("authorization")).toBe("Bearer caller-token");
      expect(headers.get("Idempotency-Key")).toBe("request-123");
      expect(JSON.parse(String(init?.body))).toEqual({ requestType: "GENERAL_SECUREPAY_HELP" });
      expect(JSON.parse(String(init?.body))).not.toHaveProperty("freeText");
      expect(JSON.parse(String(init?.body))).not.toHaveProperty("phone");
      expect(JSON.parse(String(init?.body))).not.toHaveProperty("email");
      return Response.json({
        requestId: "request-id",
        requestType: "GENERAL_SECUREPAY_HELP",
        status: "OPEN",
        offerId: "offer-id",
        title: "SecurePay help requested",
        summary: "A customer is asking for general SecurePay help.",
        requiredProgramCode: "MARKET_READY",
        interestedCount: 0,
        createdAt: "2026-09-01T05:00:00Z",
        cancelledAt: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SecurePayPlugMarketClient({
      baseUrl: "https://securepay.test/api/v1/",
      accessToken: "caller-token",
    });

    await client.createCustomerRequest("GENERAL_SECUREPAY_HELP", "request-123");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://securepay.test/api/v1/market-network/customer-requests"
    );
  });

  it("selects only by opaque candidateRef", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ candidateRef: "candidate-ref" });
      expect(JSON.parse(String(init?.body))).not.toHaveProperty("plugIdentityId");
      expect(JSON.parse(String(init?.body))).not.toHaveProperty("ksNumber");
      return Response.json({
        selectionRef: "selection-ref",
        requestId: "request-id",
        candidateRef: "candidate-ref",
        selectedAt: "2026-09-01T05:05:00Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SecurePayPlugMarketClient({
      baseUrl: "https://securepay.test/api/v1",
      accessToken: "caller-token",
    });

    await client.selectCustomerCandidate("request-id", "candidate-ref");
  });

  it("forwards explicit candidate pagination to SecurePay", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SecurePayPlugMarketClient({
      baseUrl: "https://securepay.test/api/v1",
      accessToken: "caller-token",
    });

    await client.getInterestedCandidates("request/id", 50, 100);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://securepay.test/api/v1/market-network/customer-requests/request%2Fid/candidates?limit=50&offset=100"
    );
  });

  it("opens the selected relationship without a client-supplied Plug or contact body", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get("content-type")).toBeNull();
      return Response.json({
        relationshipRef: "relationship-ref",
        requestId: "request-id",
        requestType: "GENERAL_SECUREPAY_HELP",
        status: "ACTIVE",
        openedAt: "2026-09-01T05:10:00Z",
        contactExchangeAvailable: false,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SecurePayPlugMarketClient({
      baseUrl: "https://securepay.test/api/v1",
      accessToken: "caller-token",
    });

    await expect(client.openCustomerRelationship("request-id")).resolves.toMatchObject({
      contactExchangeAvailable: false,
    });
  });

  it("preserves SecurePay HTTP conflict status so Outreach can refresh backend truth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("state changed", { status: 409 }))
    );

    const client = new SecurePayPlugMarketClient({
      baseUrl: "https://securepay.test/api/v1",
      accessToken: "caller-token",
    });

    await expect(client.openCustomerRelationship("request-id")).rejects.toMatchObject({
      name: "SecurePayMarketRequestError",
      status: 409,
    } satisfies Partial<SecurePayMarketRequestError>);
  });
});
