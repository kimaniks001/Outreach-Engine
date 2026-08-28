import { describe, expect, it } from "vitest";
import { describeModelForTask } from "./capabilities";
import type { AIModel, AIProvider } from "@/lib/ai/types";

const baseProvider: AIProvider = {
  id: "provider",
  key: "provider",
  displayName: "Provider",
  status: "AVAILABLE",
  adapterImplemented: true,
  credentialsConfigured: true,
  enabled: true,
  isMock: false,
};

const baseModel: AIModel = {
  id: "model",
  providerId: "provider",
  modelKey: "model",
  displayName: "Model",
  enabled: true,
  approved: true,
  status: "APPROVED",
  capabilities: ["creative"],
  approvedTaskTypes: ["CREATIVE_IDEATION"],
  structuredOutputSupport: true,
  contextWindowTokens: null,
  costInputPer1kUsd: null,
  costOutputPer1kUsd: null,
  qualityScore: 0.8,
};

describe("Studio capability desk", () => {
  it("shows a model as routable only when provider, model and task approval all agree", () => {
    expect(describeModelForTask(baseModel, baseProvider, "CREATIVE_IDEATION").routable).toBe(true);
  });

  it("does not treat a connected provider as task authority", () => {
    expect(describeModelForTask(baseModel, baseProvider, "IMAGE_GENERATION").routable).toBe(false);
  });

  it("does not route through a non-available provider even when the model is approved", () => {
    const provider = { ...baseProvider, status: "DEGRADED" as const };
    expect(describeModelForTask(baseModel, provider, "CREATIVE_IDEATION").routable).toBe(false);
  });
});
