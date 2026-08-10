import type { ProviderAdapter } from "./types";

// Phase 1 stub — see src/lib/ai/adapters/anthropic.ts for the rationale.
export const googleAdapter: ProviderAdapter = {
  providerKey: "google",
  envVar: "GOOGLE_AI_API_KEY",
  hasCredentials() {
    return Boolean(process.env.GOOGLE_AI_API_KEY);
  },
};
