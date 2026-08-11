import type { ProviderAdapter, ProviderExecuteInput, ProviderExecuteOutput } from "./types";

// The deterministic mock/test provider required by the Phase 2 brief
// Section 5 ("the application must remain usable without live
// credentials") and Section 25 ("for local development/tests: support a
// deterministic mock/test model path"). Needs no credentials, makes no
// network call, and always produces the same output for the same input —
// suitable for tests and for demonstrating the full flow with no
// ANTHROPIC_API_KEY configured.
//
// It is never presented as a real AI connection: src/lib/ai/types.ts's
// AIProvider.isMock flag and the Admin UI badge it distinctly (see
// docs/PHASE_2_AI_PROVIDER_INTEGRATION.md). Its analysis output is
// deliberately conservative — e.g. it always returns NEEDS_DOCTRINE_REVIEW
// for product mapping rather than pretending to reason about it — so a
// human reviewer is never misled into thinking mock output is a real
// recommendation.

function extractLine(prompt: string, key: string): string {
  const match = prompt.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function buildOpportunityMockResponse(prompt: string): string {
  const title = extractLine(prompt, "SIGNAL_TITLE") || "the submitted signal";
  const summary = extractLine(prompt, "SIGNAL_SUMMARY") || "No summary provided.";

  return JSON.stringify({
    problem: `[MOCK] Heuristic read of "${title}": ${summary}`.slice(0, 500),
    targetAudience: "[MOCK] Audience not inferred — mock provider does not reason about this.",
    sector: "[MOCK] Unspecified",
    geography: "[MOCK] Unspecified",
    securepayRelevance:
      "[MOCK] This is a deterministic placeholder, not a real assessment. Configure ANTHROPIC_API_KEY for a real analysis.",
    moneyFlowMapping: "NEEDS_DOCTRINE_REVIEW",
    productNote: "[MOCK] Mock provider never proposes a product mapping.",
    opportunityScoreProposal: {
      problemFit: 50,
      securepayFit: 50,
      audienceClarity: 50,
      commercialValue: 50,
      reachability: 50,
      urgencyTiming: 50,
    },
    evidenceReasoning: "[MOCK] Deterministic placeholder — no real reasoning was performed.",
    caveats: "This output was produced by the mock/test AI provider, not a live model. Treat only as a UI/flow demonstration.",
    recommendedNextStep: "Configure ANTHROPIC_API_KEY and re-run analysis for a real recommendation.",
  });
}

function buildBrandReviewMockResponse(): string {
  return JSON.stringify({
    narrative:
      "[MOCK] No AI enrichment available — relying entirely on the deterministic rule engine result.",
  });
}

function buildAudienceMockResponse(prompt: string): string {
  const segmentName = extractLine(prompt, "SEGMENT_NAME") || "this segment";

  return JSON.stringify({
    sector: "[MOCK] Unspecified",
    geography: "[MOCK] Unspecified",
    businessCriteria: `[MOCK] Deterministic placeholder for "${segmentName}" — configure ANTHROPIC_API_KEY for a real classification.`,
    roleFunctionCriteria: "[MOCK] Not inferred — mock provider does not reason about this.",
    companyCriteria: "[MOCK] Not inferred.",
    intentCriteria: "[MOCK] Not inferred.",
    suggestedChannels: [],
    scoreProposal: {
      problemFit: 40,
      productFit: 40,
      intent: 40,
      reachability: 40,
      commercialValue: 40,
      evidenceStrength: 20,
    },
    exclusions: "[MOCK] None proposed.",
    caveats:
      "This output was produced by the mock/test AI provider, not a live model. Treat only as a UI/flow demonstration.",
  });
}

function buildChannelRecommendationMockResponse(): string {
  return JSON.stringify({
    narrative:
      "[MOCK] No AI enrichment available — relying entirely on the deterministic channel-recommendation rule engine.",
  });
}

function buildImpactAnalysisMockResponse(): string {
  return JSON.stringify({
    narrative:
      "[MOCK] No AI enrichment available — relying entirely on the deterministic next-best-action rule engine.",
  });
}

function buildCreativeMockResponse(prompt: string): string {
  const name = extractLine(prompt, "CAMPAIGN_NAME") || "this campaign";
  const cta = extractLine(prompt, "CTA") || "Learn more";
  const coreMessage = extractLine(prompt, "CORE_MESSAGE") || "Money should follow the agreement.";

  return JSON.stringify({
    variants: [
      {
        variantLabel: "A",
        angle: "Problem-led",
        headline: `[MOCK] The problem with ${name}`,
        body: `[MOCK] Deterministic placeholder body. ${coreMessage}`,
        cta,
        imageConcept: "[MOCK] Visual direction not generated — configure ANTHROPIC_API_KEY for a real creative brief.",
        rationale: "[MOCK] Deterministic placeholder, not real creative reasoning.",
      },
      {
        variantLabel: "B",
        angle: "Agreement-led",
        headline: "[MOCK] Money should follow the agreement.",
        body: `[MOCK] ${coreMessage}`,
        cta,
        imageConcept: "[MOCK] Visual direction not generated — configure ANTHROPIC_API_KEY for a real creative brief.",
        rationale: "[MOCK] Deterministic placeholder, not real creative reasoning.",
      },
      {
        variantLabel: "C",
        angle: "Outcome-led",
        headline: "[MOCK] See the outcome.",
        body: `[MOCK] ${coreMessage}`,
        cta,
        imageConcept: "[MOCK] Visual direction not generated — configure ANTHROPIC_API_KEY for a real creative brief.",
        rationale: "[MOCK] Deterministic placeholder, not real creative reasoning.",
      },
    ],
  });
}

export const mockAdapter: ProviderAdapter = {
  providerKey: "mock",
  envVar: "", // no credentials required, by design
  hasCredentials() {
    return true;
  },
  async execute(input: ProviderExecuteInput): Promise<ProviderExecuteOutput> {
    let text: string;
    switch (input.taskType) {
      case "BRAND_REVIEW":
        text = buildBrandReviewMockResponse();
        break;
      case "CREATIVE_IDEATION":
        text = buildCreativeMockResponse(input.prompt);
        break;
      case "AUDIENCE_CLASSIFICATION":
        text = buildAudienceMockResponse(input.prompt);
        break;
      case "CHANNEL_RECOMMENDATION":
        text = buildChannelRecommendationMockResponse();
        break;
      case "IMPACT_ANALYSIS":
        text = buildImpactAnalysisMockResponse();
        break;
      default:
        text = buildOpportunityMockResponse(input.prompt);
    }

    return {
      text,
      inputTokens: estimateTokens(input.prompt),
      outputTokens: estimateTokens(text),
    };
  },
};
