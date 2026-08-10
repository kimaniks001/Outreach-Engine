import type { ProviderAdapter, ProviderExecuteInput, ProviderExecuteOutput } from "./types";

// Phase 2: a real, live adapter — the proof of the AI Gateway abstraction
// per the Phase 2 brief Section 5. Uses Anthropic's plain REST API via
// fetch rather than the @anthropic-ai/sdk package, to avoid adding a new
// dependency for a single endpoint (docs/PHASE_2_AI_PROVIDER_INTEGRATION.md
// Section on stack choice). No credential value is ever logged, returned,
// or exposed to the browser — this module only ever runs server-side.
//
// If ANTHROPIC_API_KEY is not set locally, hasCredentials() is false, the
// provider registry reports NOT_CONFIGURED (src/lib/ai/status.ts), and the
// router never selects it — execute() is simply never called. The
// application remains fully usable via the mock provider (see
// src/lib/ai/adapters/mock.ts).

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export const anthropicAdapter: ProviderAdapter = {
  providerKey: "anthropic",
  envVar: "ANTHROPIC_API_KEY",
  hasCredentials() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },
  async execute(input: ProviderExecuteInput): Promise<ProviderExecuteOutput> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Defensive — the router should never select this provider without
      // credentials, but never proceed with an empty key regardless.
      throw new Error("Anthropic adapter invoked without ANTHROPIC_API_KEY configured.");
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: input.modelKey,
        max_tokens: input.maxOutputTokens ?? 1024,
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
      }),
    });

    const body = (await response.json().catch(() => ({}))) as AnthropicResponse;

    if (!response.ok) {
      // Never include headers/request body (which could echo the key back)
      // in the thrown error — only the provider's own error message.
      throw new Error(`Anthropic API error (${response.status}): ${body.error?.message ?? "unknown error"}`);
    }

    const text = body.content?.find((block) => block.type === "text")?.text ?? "";

    return {
      text,
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
    };
  },
};
