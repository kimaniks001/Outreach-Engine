import { describe, expect, it } from "vitest";
import {
  computeTotalScore,
  deriveEvidenceStrengthScore,
  clampScore,
  buildScoreExplanation,
  SCORE_DIMENSIONS,
  type ScoreComponents,
} from "@/lib/opportunity/scoring";
import { resolveMoneyFlowMapping, MONEY_FLOW_DEFINITIONS } from "@/lib/opportunity/money-flow";

describe("opportunity scoring: component math", () => {
  it("computeTotalScore is the unweighted average of all 7 dimensions", () => {
    const components: ScoreComponents = {
      problemFit: 100,
      securepayFit: 100,
      audienceClarity: 100,
      commercialValue: 100,
      reachability: 100,
      evidenceStrength: 100,
      urgencyTiming: 100,
    };
    expect(computeTotalScore(components)).toBe(100);
  });

  it("computes a correct mixed average", () => {
    const components: ScoreComponents = {
      problemFit: 80,
      securepayFit: 60,
      audienceClarity: 40,
      commercialValue: 20,
      reachability: 100,
      evidenceStrength: 0,
      urgencyTiming: 50,
    };
    // (80+60+40+20+100+0+50)/7 = 350/7 = 50
    expect(computeTotalScore(components)).toBe(50);
  });

  it("clamps out-of-range component scores into 0-100", () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(50.6)).toBe(51);
  });

  it("every dimension has an explanation, defaulting to a generated one", () => {
    const components: ScoreComponents = {
      problemFit: 50,
      securepayFit: 50,
      audienceClarity: 50,
      commercialValue: 50,
      reachability: 50,
      evidenceStrength: 50,
      urgencyTiming: 50,
    };
    const explanation = buildScoreExplanation(components, { problemFit: "custom reason" });
    expect(explanation.problemFit).toBe("custom reason");
    for (const dimension of SCORE_DIMENSIONS) {
      expect(explanation[dimension].length).toBeGreaterThan(0);
    }
  });
});

describe("evidence strength: deterministic, not AI-proposed", () => {
  it("scores at the floor when there is no evidence (MANUAL/UNVERIFIED)", () => {
    expect(deriveEvidenceStrengthScore([])).toBeLessThanOrEqual(10);
  });

  it("scores much higher for verified, high-confidence evidence", () => {
    const unverifiedScore = deriveEvidenceStrengthScore([]);
    const verifiedScore = deriveEvidenceStrengthScore([{ verificationStatus: "VERIFIED", confidence: 0.95 }]);
    expect(verifiedScore).toBeGreaterThan(unverifiedScore);
    expect(verifiedScore).toBeGreaterThanOrEqual(80);
  });

  it("weak evidence scores lower than verified evidence", () => {
    const weak = deriveEvidenceStrengthScore([{ verificationStatus: "WEAK_EVIDENCE", confidence: 0.5 }]);
    const verified = deriveEvidenceStrengthScore([{ verificationStatus: "VERIFIED", confidence: 0.5 }]);
    expect(weak).toBeLessThan(verified);
  });

  it("rejected evidence is excluded from scoring, not counted as support", () => {
    const onlyRejected = deriveEvidenceStrengthScore([{ verificationStatus: "REJECTED", confidence: 0.9 }]);
    expect(onlyRejected).toBeLessThanOrEqual(10);
  });

  it("multiple corroborating sources score higher than a single one", () => {
    const single = deriveEvidenceStrengthScore([{ verificationStatus: "NEEDS_REVIEW", confidence: 0.7 }]);
    const multiple = deriveEvidenceStrengthScore([
      { verificationStatus: "NEEDS_REVIEW", confidence: 0.7 },
      { verificationStatus: "NEEDS_REVIEW", confidence: 0.7 },
    ]);
    expect(multiple).toBeGreaterThan(single);
  });
});

describe("money-flow doctrine: no hallucination", () => {
  it("resolves exact known values case-insensitively", () => {
    expect(resolveMoneyFlowMapping("one_to_one")).toBe("ONE_TO_ONE");
    expect(resolveMoneyFlowMapping("MANY_TO_ONE")).toBe("MANY_TO_ONE");
  });

  it("coerces anything unrecognized to NEEDS_DOCTRINE_REVIEW rather than guessing", () => {
    expect(resolveMoneyFlowMapping("some new product AI invented")).toBe("NEEDS_DOCTRINE_REVIEW");
    expect(resolveMoneyFlowMapping("")).toBe("NEEDS_DOCTRINE_REVIEW");
  });

  it("only exposes the four doctrine-authorized money-flow types", () => {
    expect(Object.keys(MONEY_FLOW_DEFINITIONS).sort()).toEqual(
      ["MANY_TO_MANY", "MANY_TO_ONE", "ONE_TO_MANY", "ONE_TO_ONE"].sort()
    );
  });

  it("ONE_TO_ONE maps to SecureLink / KeyContract exactly as specified", () => {
    expect(MONEY_FLOW_DEFINITIONS.ONE_TO_ONE.product).toBe("SecureLink / KeyContract");
  });
});
