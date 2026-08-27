import { describe, expect, it, vi } from "vitest";
import {
  lifetimeShareAuthority,
  totalConfirmedReferralRewardEvidence,
  type ReferralHistoryEvidence,
} from "@/lib/market/referral-authority";
import { SecurePayReferralClient } from "@/lib/market/securepay-referral-client";

function history(overrides: Partial<ReferralHistoryEvidence> = {}): ReferralHistoryEvidence {
  return {
    referralCode: "REF-ABC",
    totalReferred: 2,
    activatedOrLaterCount: 2,
    relationships: [
      {
        relationshipId: "r1",
        referredKsNumber: "KS1001",
        status: "QUALIFIED",
        createdAt: "2026-01-01T00:00:00Z",
        activatedAt: "2026-01-02T00:00:00Z",
        qualifiedAt: "2026-02-01T00:00:00Z",
        rewardAmountMinor: 1250,
        rewardCurrency: "KES",
        pricingVersion: "pricing-v1",
        referralRuleVersion: "ref-v1",
        qualificationExplanation: "Settlement-backed qualification",
        settlementEvidenceReference: "e1",
      },
      {
        relationshipId: "r2",
        referredKsNumber: "KS1002",
        status: "ACTIVATED",
        createdAt: "2026-01-03T00:00:00Z",
        activatedAt: "2026-01-04T00:00:00Z",
        qualifiedAt: null,
        rewardAmountMinor: null,
        rewardCurrency: null,
        pricingVersion: null,
        referralRuleVersion: null,
        qualificationExplanation: null,
        settlementEvidenceReference: null,
      },
    ],
    ...overrides,
  };
}

describe("SecurePay referral authority", () => {
  it("calls the self-scoped referral endpoint with the current caller bearer token", async () => {
    const expected = history();
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://securepay.test/api/v1/referrals/me/history");
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer caller-token");
      return Response.json(expected);
    });

    const client = new SecurePayReferralClient({
      baseUrl: "https://securepay.test/api/v1/",
      accessToken: "caller-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.getMyReferralHistory()).resolves.toEqual(expected);
  });

  it("does not have a service-token fallback", () => {
    expect(
      () =>
        new SecurePayReferralClient({
          baseUrl: "https://securepay.test/api/v1",
          accessToken: "   ",
        })
    ).toThrow("Caller-scoped SecurePay accessToken is required");
  });
});

describe("My Market reward evidence", () => {
  it("adds only reward amounts already confirmed on backend relationships", () => {
    expect(totalConfirmedReferralRewardEvidence(history())).toEqual({
      amountMinor: 1250,
      currency: "KES",
      relationshipCount: 1,
    });
  });

  it("returns no total when no relationship has backend reward evidence", () => {
    const empty = history({
      relationships: history().relationships.map((relationship) => ({
        ...relationship,
        rewardAmountMinor: null,
        rewardCurrency: null,
      })),
    });

    expect(totalConfirmedReferralRewardEvidence(empty)).toBeNull();
  });

  it("fails closed rather than combine mixed currencies", () => {
    const base = history().relationships;
    const first = base[0];
    const second = base[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) throw new Error("test fixture missing relationships");

    const mixed = history({
      relationships: [
        first,
        {
          ...second,
          status: "QUALIFIED",
          rewardAmountMinor: 500,
          rewardCurrency: "USD",
        },
      ],
    });

    expect(totalConfirmedReferralRewardEvidence(mixed)).toBeNull();
  });

  it("never synthesizes the proposed lifetime 10 percent entitlement", () => {
    expect(lifetimeShareAuthority.status).toBe("NOT_BACKEND_SUPPORTED");
    expect(lifetimeShareAuthority.currentTruth).toContain("does not yet expose or calculate");
    expect(lifetimeShareAuthority.requiredBackendDecision).toContain("which platform-fee families qualify");
  });
});
