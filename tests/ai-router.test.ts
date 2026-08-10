import { describe, expect, it } from "vitest";
import { deriveProviderStatus } from "@/lib/ai/status";
import { selectModel, type RoutingCandidate } from "@/lib/ai/router";
import type { AIModel, AIProvider } from "@/lib/ai/types";

describe("deriveProviderStatus: docs/MODEL_CONTROL_PLANE.md Section 4", () => {
  it("is NOT_CONFIGURED when adapter or credentials are missing, even if enabled", () => {
    expect(
      deriveProviderStatus({
        enabled: true,
        adapterImplemented: false,
        credentialsConfigured: true,
        manuallyDegraded: false,
      })
    ).toBe("NOT_CONFIGURED");

    expect(
      deriveProviderStatus({
        enabled: true,
        adapterImplemented: true,
        credentialsConfigured: false,
        manuallyDegraded: false,
      })
    ).toBe("NOT_CONFIGURED");
  });

  it("is DISABLED whenever not enabled, regardless of everything else", () => {
    expect(
      deriveProviderStatus({
        enabled: false,
        adapterImplemented: true,
        credentialsConfigured: true,
        manuallyDegraded: false,
      })
    ).toBe("DISABLED");
  });

  it("is AVAILABLE only when adapter + credentials + enabled all hold", () => {
    expect(
      deriveProviderStatus({
        enabled: true,
        adapterImplemented: true,
        credentialsConfigured: true,
        manuallyDegraded: false,
      })
    ).toBe("AVAILABLE");
  });

  it("never falsely reports AVAILABLE without credentials configured", () => {
    expect(
      deriveProviderStatus({
        enabled: true,
        adapterImplemented: true,
        credentialsConfigured: false,
        manuallyDegraded: false,
      })
    ).not.toBe("AVAILABLE");
  });

  it("DEGRADED requires an explicit manual override, not inferred automatically", () => {
    expect(
      deriveProviderStatus({
        enabled: true,
        adapterImplemented: true,
        credentialsConfigured: true,
        manuallyDegraded: true,
      })
    ).toBe("DEGRADED");
  });
});

function fakeCandidate(overrides: Partial<AIModel> & { providerKey?: string }): RoutingCandidate {
  const provider: AIProvider = {
    id: overrides.providerId ?? "provider-1",
    key: overrides.providerKey ?? "anthropic",
    displayName: "Anthropic",
    status: "AVAILABLE",
    adapterImplemented: true,
    credentialsConfigured: true,
    enabled: true,
  };
  const model: AIModel = {
    id: "model-1",
    providerId: provider.id,
    modelKey: "model-1",
    displayName: "Model 1",
    enabled: true,
    approved: true,
    status: "APPROVED",
    capabilities: [],
    approvedTaskTypes: ["MARKET_RESEARCH"],
    structuredOutputSupport: false,
    contextWindowTokens: null,
    costInputPer1kUsd: null,
    costOutputPer1kUsd: null,
    qualityScore: null,
    ...overrides,
  };
  return { model, provider };
}

describe("selectModel: Phase 1 brief Section 15", () => {
  it("returns NO_AVAILABLE_MODEL when there are no candidates — never guesses", () => {
    const decision = selectModel([], "MARKET_RESEARCH");
    expect(decision.outcome).toBe("NO_AVAILABLE_MODEL");
  });

  it("selects the candidate with the highest quality score", () => {
    const low = fakeCandidate({ id: "low", modelKey: "low", qualityScore: 0.5 });
    const high = fakeCandidate({ id: "high", modelKey: "high", qualityScore: 0.9 });
    const decision = selectModel([low, high], "MARKET_RESEARCH");
    expect(decision.outcome).toBe("SELECTED");
    if (decision.outcome === "SELECTED") {
      expect(decision.model.id).toBe("high");
    }
  });

  it("tie-breaks on lowest input cost when quality scores match", () => {
    const expensive = fakeCandidate({
      id: "expensive",
      modelKey: "expensive",
      qualityScore: 0.8,
      costInputPer1kUsd: 5,
    });
    const cheap = fakeCandidate({
      id: "cheap",
      modelKey: "cheap",
      qualityScore: 0.8,
      costInputPer1kUsd: 1,
    });
    const decision = selectModel([expensive, cheap], "MARKET_RESEARCH");
    expect(decision.outcome).toBe("SELECTED");
    if (decision.outcome === "SELECTED") {
      expect(decision.model.id).toBe("cheap");
    }
  });

  it("every SELECTED decision carries a human-readable reason", () => {
    const candidate = fakeCandidate({ qualityScore: 0.7 });
    const decision = selectModel([candidate], "MARKET_RESEARCH");
    expect(decision.outcome).toBe("SELECTED");
    if (decision.outcome === "SELECTED") {
      expect(decision.reason.length).toBeGreaterThan(0);
    }
  });

  it("NO_AVAILABLE_MODEL decisions carry a human-readable reason too", () => {
    const decision = selectModel([], "CAMPAIGN_STRATEGY");
    expect(decision.outcome).toBe("NO_AVAILABLE_MODEL");
    if (decision.outcome === "NO_AVAILABLE_MODEL") {
      expect(decision.reason).toContain("CAMPAIGN_STRATEGY");
    }
  });
});
