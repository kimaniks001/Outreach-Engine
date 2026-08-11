import type { DistributionAdapter } from "./types";

// Boundary-only stub — see google-ads.ts for the full rationale. No
// META_ADS_* environment variable is read anywhere in this codebase;
// validateConfiguration() must never report AVAILABLE.
export const metaAdsAdapter: DistributionAdapter = {
  adapterKey: "meta_ads",
  channelsSupported: ["META_FACEBOOK", "META_INSTAGRAM"],

  validateConfiguration() {
    return {
      ok: false,
      reason: "Meta Ads is not configured. No live adapter is implemented in Phase 3 — planning only.",
    };
  },

  async launch(): Promise<never> {
    throw new Error("Meta Ads adapter is not configured — no live execution is possible in Phase 3.");
  },

  async pause(): Promise<never> {
    throw new Error("Meta Ads adapter is not configured.");
  },

  async status(): Promise<never> {
    throw new Error("Meta Ads adapter is not configured.");
  },

  async spendSnapshot(): Promise<never> {
    throw new Error("Meta Ads adapter is not configured.");
  },

  normalizeError(err: unknown) {
    const message = err instanceof Error ? err.message : "Meta Ads adapter error.";
    return { errorCode: "NOT_CONFIGURED", normalizedError: message };
  },
};
