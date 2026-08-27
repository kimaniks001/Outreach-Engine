import { describe, expect, it } from "vitest";
import {
  authoritativeOpportunityEligible,
  getReadinessAuthority,
  hasCurrentCredential,
  type AuthoritativeReadinessProjection,
} from "@/lib/readiness/authority";
import {
  marketReadyCheck,
  previewOpportunityEligible,
  propertySpecialistCheck,
  readinessPrinciples,
  scoreCheck,
} from "@/lib/readiness/foundation";

describe("market readiness foundation", () => {
  it("passes the core practice check only when the required scenarios are correct", () => {
    const result = scoreCheck(marketReadyCheck, {
      "cement-delivery": "b",
      "customer-verification": "a",
      "hard-question": "b",
    });

    expect(result).toEqual({ score: 3, total: 3, passed: true });
  });

  it("does not turn a partial practice result into Market Ready", () => {
    const result = scoreCheck(marketReadyCheck, {
      "cement-delivery": "b",
      "customer-verification": "b",
      "hard-question": "b",
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(2);
  });

  it("keeps specialist practice dependent on its own domain judgement", () => {
    const result = scoreCheck(propertySpecialistCheck, {
      "seller-title": "b",
      "land-deposit": "b",
    });

    expect(result).toEqual({ score: 2, total: 2, passed: true });
  });

  it("can explain a prototype unlock without treating it as backend eligibility", () => {
    expect(
      previewOpportunityEligible(
        ["Market Ready", "Property Specialist"],
        ["Market Ready", "Property Specialist"]
      )
    ).toBe(true);
    expect(readinessPrinciples.prototype).toContain("never writes a real Plug");
  });
});

describe("readiness authority", () => {
  it("fails closed while SecurePay has no Plug/readiness credential contract", async () => {
    const result = await getReadinessAuthority();

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.projection).toBeNull();
    expect(authoritativeOpportunityEligible(result.projection, ["Market Ready"])).toBe(false);
  });

  it("accepts only CURRENT backend credentials for real opportunity eligibility", () => {
    const projection: AuthoritativeReadinessProjection = {
      source: "BACKEND",
      plugStatus: "MARKET_READY",
      credentials: [
        {
          credentialId: "cred-market-ready",
          name: "Market Ready",
          kind: "READINESS",
          status: "CURRENT",
          awardedAt: "2026-08-27T10:00:00Z",
          evidenceVersion: "market-ready-v1",
        },
        {
          credentialId: "cred-property",
          name: "Property Specialist",
          kind: "SPECIALIST",
          status: "REFRESH_REQUIRED",
          awardedAt: "2026-05-01T10:00:00Z",
          evidenceVersion: "property-v1",
        },
      ],
    };

    expect(hasCurrentCredential(projection, "Market Ready")).toBe(true);
    expect(hasCurrentCredential(projection, "Property Specialist")).toBe(false);
    expect(
      authoritativeOpportunityEligible(projection, ["Market Ready", "Property Specialist"])
    ).toBe(false);
  });
});
