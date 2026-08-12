// Shared AI provider/model seed data — imported by both scripts/seed.ts
// (local dev, seeds demo data too) and scripts/bootstrap-production.ts
// (production-safe, never seeds demo data). Extracted here specifically
// so importing it triggers no side effects (no top-level main() call) —
// see docs/PRODUCTION_READINESS_REVIEW.md.
import { db, schema } from "../src/lib/db";

interface ModelSeed {
  modelKey: string;
  displayName: string;
  capabilities: string[];
  approvedTaskTypes: string[];
  structuredOutputSupport: boolean;
  approved: boolean;
  status: "APPROVED" | "PENDING_REVIEW" | "DEPRECATED";
  qualityScore: number | null;
  costInputPer1kUsd: number | null;
  costOutputPer1kUsd: number | null;
}

// Phase 2 task types this build actually wires up an AI task for — see
// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 12/13, extended by
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 9/11. Named
// PHASE_2_TASK_TYPES for historical continuity with that document; this is
// now the full set of task types this build wires up an AI task for.
const PHASE_2_TASK_TYPES = [
  "OPPORTUNITY_CLASSIFICATION",
  "MARKET_RESEARCH",
  "SOURCE_SYNTHESIS",
  "BRAND_REVIEW",
  "CREATIVE_IDEATION",
  "AUDIENCE_CLASSIFICATION",
  "CHANNEL_RECOMMENDATION",
  "IMPACT_ANALYSIS",
  "GROWTH_RECOMMENDATION",
];

const PROVIDERS: Array<{
  key: string;
  displayName: string;
  enabledByDefault: boolean;
  isMock: boolean;
  models: ModelSeed[];
}> = [
  {
    key: "anthropic",
    displayName: "Anthropic",
    // Enabled by default: if ANTHROPIC_API_KEY is set, this provider
    // becomes AVAILABLE immediately without an extra manual step (Phase 2
    // brief Section 24). With no key, it correctly stays NOT_CONFIGURED —
    // enabling alone never fabricates connectivity, see src/lib/ai/status.ts.
    enabledByDefault: true,
    isMock: false,
    models: [
      {
        // Data-driven, not hard-coded doctrine — an Owner can add/replace
        // model rows without a code change. "-latest" alias avoids pinning
        // a permanent dated snapshot. See docs/PHASE_2_AI_PROVIDER_INTEGRATION.md.
        modelKey: "claude-3-5-haiku-latest",
        displayName: "Claude 3.5 Haiku",
        capabilities: ["text-generation", "structured-output"],
        approvedTaskTypes: PHASE_2_TASK_TYPES,
        structuredOutputSupport: true,
        approved: true,
        status: "APPROVED",
        qualityScore: 0.82,
        costInputPer1kUsd: 0.0008,
        costOutputPer1kUsd: 0.004,
      },
    ],
  },
  {
    key: "openai",
    displayName: "OpenAI",
    enabledByDefault: false,
    isMock: false,
    models: [
      {
        modelKey: "openai-default",
        displayName: "OpenAI — default model (placeholder)",
        capabilities: ["text-generation", "structured-output"],
        approvedTaskTypes: [],
        structuredOutputSupport: true,
        approved: false,
        status: "PENDING_REVIEW",
        qualityScore: null,
        costInputPer1kUsd: null,
        costOutputPer1kUsd: null,
      },
    ],
  },
  {
    key: "google",
    displayName: "Google",
    enabledByDefault: false,
    isMock: false,
    models: [
      {
        modelKey: "google-default",
        displayName: "Google — default model (placeholder)",
        capabilities: ["text-generation"],
        approvedTaskTypes: [],
        structuredOutputSupport: false,
        approved: false,
        status: "PENDING_REVIEW",
        qualityScore: null,
        costInputPer1kUsd: null,
        costOutputPer1kUsd: null,
      },
    ],
  },
  {
    key: "mock",
    displayName: "Mock / Test Provider",
    enabledByDefault: true, // needs no credentials — keeps the app usable with zero setup
    isMock: true,
    models: [
      {
        modelKey: "mock-structured-v1",
        displayName: "Mock structured responder",
        capabilities: ["text-generation", "structured-output"],
        approvedTaskTypes: PHASE_2_TASK_TYPES,
        structuredOutputSupport: true,
        approved: true,
        status: "APPROVED",
        // Deliberately low — a real, properly configured Anthropic model
        // always outranks the mock in src/lib/ai/router.ts's deterministic
        // quality-score ordering. Mock is the fallback, never preferred.
        qualityScore: 0.3,
        costInputPer1kUsd: 0,
        costOutputPer1kUsd: 0,
      },
    ],
  },
];

export async function seedProvidersAndModels() {
  for (const provider of PROVIDERS) {
    const [row] = await db
      .insert(schema.aiProviders)
      .values({
        key: provider.key,
        displayName: provider.displayName,
        adapterImplemented: true, // adapter file exists — see src/lib/ai/adapters
        credentialsConfigured: false, // computed live from env at read time; this is just the seed default
        enabled: provider.enabledByDefault,
        isMock: provider.isMock,
        status: "NOT_CONFIGURED",
        classification: "INTERNAL",
      })
      .onConflictDoUpdate({
        target: schema.aiProviders.key,
        set: { displayName: provider.displayName, adapterImplemented: true, isMock: provider.isMock },
      })
      .returning();

    if (!row) continue;

    for (const model of provider.models) {
      await db
        .insert(schema.aiModels)
        .values({
          providerId: row.id,
          modelKey: model.modelKey,
          displayName: model.displayName,
          enabled: model.approved, // only enable models that are also approved
          approved: model.approved,
          status: model.status,
          capabilities: model.capabilities,
          approvedTaskTypes: model.approvedTaskTypes,
          structuredOutputSupport: model.structuredOutputSupport,
          qualityScore: model.qualityScore !== null ? String(model.qualityScore) : null,
          costInputPer1kUsd: model.costInputPer1kUsd !== null ? String(model.costInputPer1kUsd) : null,
          costOutputPer1kUsd: model.costOutputPer1kUsd !== null ? String(model.costOutputPer1kUsd) : null,
          classification: "INTERNAL",
        })
        .onConflictDoUpdate({
          target: [schema.aiModels.providerId, schema.aiModels.modelKey],
          set: {
            displayName: model.displayName,
            approved: model.approved,
            enabled: model.approved,
            status: model.status,
            approvedTaskTypes: model.approvedTaskTypes,
            qualityScore: model.qualityScore !== null ? String(model.qualityScore) : null,
            costInputPer1kUsd: model.costInputPer1kUsd !== null ? String(model.costInputPer1kUsd) : null,
            costOutputPer1kUsd: model.costOutputPer1kUsd !== null ? String(model.costOutputPer1kUsd) : null,
          },
        });
    }
  }
}
