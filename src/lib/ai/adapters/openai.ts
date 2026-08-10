import type { ProviderAdapter } from "./types";

// Phase 1 stub — see src/lib/ai/adapters/anthropic.ts for the rationale.
export const openaiAdapter: ProviderAdapter = {
  providerKey: "openai",
  envVar: "OPENAI_API_KEY",
  hasCredentials() {
    return Boolean(process.env.OPENAI_API_KEY);
  },
};
