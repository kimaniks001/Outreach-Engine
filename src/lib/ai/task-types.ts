// Matches the Phase 1 brief Section 16. These are categories only — no
// agents are implemented for any of them in Phase 1. See
// docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md Non-Goals.
export const AI_TASK_TYPES = [
  "MARKET_RESEARCH",
  "SOURCE_SYNTHESIS",
  "OPPORTUNITY_CLASSIFICATION",
  "BRAND_REVIEW",
  "CAMPAIGN_STRATEGY",
  "CONTENT_COPY",
  "CREATIVE_IDEATION",
  "AUDIENCE_CLASSIFICATION",
  // Phase 3 — docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 11. Optional
  // narrative enrichment only, mirroring BRAND_REVIEW's role: the
  // deterministic channel-recommendation rule engine
  // (src/lib/distribution/channel-recommendation.ts) is always authoritative
  // for the channel list/priority; this task can never change it.
  "CHANNEL_RECOMMENDATION",
  "IMPACT_ANALYSIS",
  "GROWTH_RECOMMENDATION",
] as const;

export type AITaskType = (typeof AI_TASK_TYPES)[number];
