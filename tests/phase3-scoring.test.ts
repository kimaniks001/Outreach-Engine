import { describe, expect, it } from "vitest";
import { computeTotalScore, clampScore, buildScoreExplanation, SCORE_DIMENSIONS, type ScoreComponents } from "@/lib/audience/scoring";
import { checkTargetingText, assertNoProhibitedTargeting, ProhibitedTargetingError } from "@/lib/audience/targeting-guard";
import { scoreChannels, rankRecommendedChannels, RECOMMENDATION_THRESHOLD } from "@/lib/distribution/channel-recommendation";
import { CHANNEL_TYPES } from "@/lib/distribution/channels";

describe("audience targeting score: component math", () => {
  it("computeTotalScore is the unweighted average of the 6 required dimensions", () => {
    const components: ScoreComponents = {
      problemFit: 100,
      productFit: 100,
      intent: 100,
      reachability: 100,
      commercialValue: 100,
      evidenceStrength: 100,
    };
    expect(computeTotalScore(components)).toBe(100);
  });

  it("computes a correct mixed average without channelFit", () => {
    const components: ScoreComponents = {
      problemFit: 80,
      productFit: 60,
      intent: 40,
      reachability: 20,
      commercialValue: 100,
      evidenceStrength: 0,
    };
    // (80+60+40+20+100+0)/6 = 300/6 = 50
    expect(computeTotalScore(components)).toBe(50);
  });

  it("includes channelFit in the average only when supplied", () => {
    const withChannelFit: ScoreComponents = {
      problemFit: 50,
      productFit: 50,
      intent: 50,
      reachability: 50,
      commercialValue: 50,
      evidenceStrength: 50,
      channelFit: 100,
    };
    // (50*6 + 100) / 7 = 400/7 ≈ 57
    expect(computeTotalScore(withChannelFit)).toBe(57);
  });

  it("clamps out-of-range component scores into 0-100", () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(50.6)).toBe(51);
  });

  it("every required dimension has an explanation, defaulting to a generated one", () => {
    const components: ScoreComponents = {
      problemFit: 50,
      productFit: 50,
      intent: 50,
      reachability: 50,
      commercialValue: 50,
      evidenceStrength: 50,
    };
    const explanation = buildScoreExplanation(components, { problemFit: "custom reason" });
    expect(explanation.problemFit).toBe("custom reason");
    for (const dimension of SCORE_DIMENSIONS) {
      expect(explanation[dimension]!.length).toBeGreaterThan(0);
    }
  });
});

describe("sensitive-targeting guard: deterministic, always-authoritative", () => {
  it("rejects religion as a targeting dimension", () => {
    const findings = checkTargetingText("Target Christian small business owners", "intentCriteria");
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.category).toBe("religion");
  });

  it("rejects ethnicity as a targeting dimension", () => {
    const findings = checkTargetingText("Focus on the Kikuyu ethnic community", "sector");
    expect(findings.some((f) => f.category === "ethnicity")).toBe(true);
  });

  it("rejects health conditions as a targeting dimension", () => {
    const findings = checkTargetingText("Target people with diabetes", "intentCriteria");
    expect(findings.some((f) => f.category === "health")).toBe(true);
  });

  it("rejects sexual orientation / gender identity as a targeting dimension", () => {
    const findings = checkTargetingText("Target the gay community", "intentCriteria");
    expect(findings.some((f) => f.category === "sexual orientation / gender identity")).toBe(true);
  });

  it("rejects political beliefs as a targeting dimension", () => {
    const findings = checkTargetingText("Target ruling party supporters", "intentCriteria");
    expect(findings.some((f) => f.category === "political beliefs")).toBe(true);
  });

  it("allows commercial/business targeting language through cleanly", () => {
    const findings = checkTargetingText(
      "Contractors and construction project managers managing milestone-based payments in Kenya",
      "intentCriteria"
    );
    expect(findings.length).toBe(0);
  });

  it("assertNoProhibitedTargeting throws a typed error across multiple fields", () => {
    expect(() =>
      assertNoProhibitedTargeting({
        description: "Legitimate business description",
        sector: "Construction",
        intentCriteria: "Target Muslim business owners", // prohibited
      })
    ).toThrow(ProhibitedTargetingError);
  });

  it("malformed/tainted AI output is rejected the same way as human input", () => {
    // Simulates AI output that tried to smuggle a sensitive trait into a
    // field — the guard applies identically regardless of source.
    const aiProposedFields = {
      description: "Targeting proposal",
      roleFunctionCriteria: "undocumented immigrants seeking payment protection",
    };
    expect(() => assertNoProhibitedTargeting(aiProposedFields)).toThrow(ProhibitedTargetingError);
  });
});

describe("channel recommendation engine: deterministic, no black-box optimization", () => {
  const baseInput = {
    campaignObjective: "Generate qualified interest",
    audienceSegment: {
      sector: null,
      geography: null,
      intentCriteria: null,
      roleFunctionCriteria: null,
      companyCriteria: null,
      businessCriteria: null,
      channelEligibility: [],
    },
  };

  it("scores every defined channel type exactly once", () => {
    const scored = scoreChannels(baseInput);
    expect(scored.length).toBe(CHANNEL_TYPES.length);
    expect(new Set(scored.map((s) => s.channel)).size).toBe(CHANNEL_TYPES.length);
  });

  it("is deterministic — identical input produces identical scores", () => {
    const first = scoreChannels(baseInput);
    const second = scoreChannels(baseInput);
    expect(first).toEqual(second);
  });

  it("boosts Google Search for high-intent commercial-problem language", () => {
    const highIntent = scoreChannels({
      ...baseInput,
      campaignObjective: "Capture searchers looking for a solution to their milestone payment problem",
    });
    const low = scoreChannels(baseInput);
    const highIntentGoogle = highIntent.find((c) => c.channel === "GOOGLE_SEARCH")!;
    const lowGoogle = low.find((c) => c.channel === "GOOGLE_SEARCH")!;
    expect(highIntentGoogle.score).toBeGreaterThan(lowGoogle.score);
  });

  it("boosts LinkedIn for B2B role/company-shaped audiences", () => {
    const b2b = scoreChannels({
      ...baseInput,
      audienceSegment: { ...baseInput.audienceSegment, roleFunctionCriteria: "Procurement managers at enterprise companies" },
    });
    const linkedIn = b2b.find((c) => c.channel === "LINKEDIN")!;
    const baseline = scoreChannels(baseInput).find((c) => c.channel === "LINKEDIN")!;
    expect(linkedIn.score).toBeGreaterThan(baseline.score);
  });

  it("only surfaces channels clearing the recommendation threshold, ranked by priority", () => {
    const ranked = rankRecommendedChannels(baseInput);
    for (const rec of ranked) {
      expect(rec.score).toBeGreaterThanOrEqual(RECOMMENDATION_THRESHOLD);
    }
    const priorities = ranked.map((r) => r.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });
});
