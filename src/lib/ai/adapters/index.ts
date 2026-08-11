import type { ProviderAdapter } from "./types";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";
import { googleAdapter } from "./google";
import { mockAdapter } from "./mock";

// The only place that lists which providers have an adapter implemented at
// all. Adding a new provider means adding a file here — application code
// elsewhere never changes.
export const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  mock: mockAdapter,
};

export function getAdapter(providerKey: string): ProviderAdapter | null {
  return PROVIDER_ADAPTERS[providerKey] ?? null;
}
