import type { ProviderAdapter } from "./types";

// Phase 1 stub. Deliberately does not import the Anthropic SDK and never
// makes a network call — see docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md
// Non-Goals and the Phase 1 brief Section 12 ("Preferred Phase 1 state: all
// provider adapters are non-live stubs/config definitions").
export const anthropicAdapter: ProviderAdapter = {
  providerKey: "anthropic",
  envVar: "ANTHROPIC_API_KEY",
  hasCredentials() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },
};
