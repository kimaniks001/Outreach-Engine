import { describe, expect, it } from "vitest";
import { selectModel, type RoutingCandidate } from "./router";
import type { AIModel, AIProvider } from "./types";

function provider(id: string, name: string): AIProvider {
  return {
    id,
    key: name.toLowerCase(),
    displayName: name,
    status: "AVAILABLE",
    adapterImplemented: true,
    credentialsConfigured: true,
    enabled: true,
    isMock: false,
  };
}

function model(id: string, providerId: string, qualityScore: number): AIModel {
  return {
    id,
    providerId,
    modelKey: id,
    displayName: id,
    enabled: true,
    approved: true,
    status: "APPROVED",
    capabilities: ["creative"],
    approvedTaskTypes: ["CREATIVE_IDEATION"],
    structuredOutputSupport: true,
    contextWindowTokens: 100_000,
    costInputPer1kUsd: 0.01,
    costOutputPer1kUsd: 0.02,
    qualityScore,
  };
}

function candidate(id: string, qualityScore: number): RoutingCandidate {
  const p = provider(`p-${id}`, `Provider ${id}`);
  return { provider: p, model: model(id, p.id, qualityScore) };
}

describe("Studio model preference routing", () => {
  it("uses the explicitly preferred model only when it is already routable", () => {
    const high = candidate("high", 0.99);
    const preferred = candidate("preferred", 0.7);

    const result = selectModel([high, preferred], "CREATIVE_IDEATION", preferred.model.id);

    expect(result.outcome).toBe("SELECTED");
    if (result.outcome === "SELECTED") {
      expect(result.model.id).toBe("preferred");
      expect(result.reason).toContain("explicitly chosen in Studio");
    }
  });

  it("fails closed when a preferred model is not in the governed routable candidate set", () => {
    const only = candidate("approved", 0.9);

    const result = selectModel([only], "CREATIVE_IDEATION", "not-routable");

    expect(result.outcome).toBe("NO_AVAILABLE_MODEL");
    if (result.outcome === "NO_AVAILABLE_MODEL") {
      expect(result.reason).toContain("not currently approved and AVAILABLE");
    }
  });

  it("keeps deterministic quality-first routing when no model is explicitly chosen", () => {
    const lower = candidate("lower", 0.7);
    const higher = candidate("higher", 0.95);

    const result = selectModel([lower, higher], "CREATIVE_IDEATION");

    expect(result.outcome).toBe("SELECTED");
    if (result.outcome === "SELECTED") expect(result.model.id).toBe("higher");
  });
});
