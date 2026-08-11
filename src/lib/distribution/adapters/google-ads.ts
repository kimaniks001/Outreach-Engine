import type { DistributionAdapter } from "./types";

// Boundary-only stub — proves the adapter interface can host a real Google
// Ads integration later without an application rewrite (ADR-001), but no
// live execution exists in Phase 3. No GOOGLE_ADS_* environment variable is
// read anywhere in this codebase; validateConfiguration() must never report
// AVAILABLE. Mirrors the shape of src/lib/ai/adapters/openai.ts (Phase 1/2
// non-live stub pattern).
export const googleAdsAdapter: DistributionAdapter = {
  adapterKey: "google_ads",
  channelsSupported: ["GOOGLE_SEARCH", "GOOGLE_DISPLAY", "YOUTUBE"],

  validateConfiguration() {
    return {
      ok: false,
      reason: "Google Ads is not configured. No live adapter is implemented in Phase 3 — planning only.",
    };
  },

  async launch(): Promise<never> {
    throw new Error("Google Ads adapter is not configured — no live execution is possible in Phase 3.");
  },

  async pause(): Promise<never> {
    throw new Error("Google Ads adapter is not configured.");
  },

  async status(_id: string): Promise<never> {
    throw new Error("Google Ads adapter is not configured.");
  },

  async spendSnapshot(): Promise<never> {
    throw new Error("Google Ads adapter is not configured.");
  },

  normalizeError(err: unknown) {
    const message = err instanceof Error ? err.message : "Google Ads adapter error.";
    return { errorCode: "NOT_CONFIGURED", normalizedError: message };
  },
};
