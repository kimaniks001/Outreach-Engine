// Governed AI task categories. A task type describes what a model is being
// asked to do; it does not grant publication, legal, budget or financial
// authority. Models remain separately approved/enabled per task in the Model
// Registry.
export const AI_TASK_TYPES = [
  "MARKET_RESEARCH",
  "SOURCE_SYNTHESIS",
  "OPPORTUNITY_CLASSIFICATION",
  "BRAND_REVIEW",
  "CAMPAIGN_STRATEGY",
  "CONTENT_COPY",
  "CREATIVE_IDEATION",
  "AUDIENCE_CLASSIFICATION",
  // Distribution recommendation remains deterministic-authority first. AI
  // may enrich the explanation but cannot change the authoritative channel
  // list/priority.
  "CHANNEL_RECOMMENDATION",
  "IMPACT_ANALYSIS",
  "GROWTH_RECOMMENDATION",
  // Outreach Master Completion Roadmap v1.0 — Studio capability lanes.
  // These task types make specialist model capability explicit. Adding a
  // category here never makes a provider/model routable: the registry still
  // requires AVAILABLE provider + enabled/approved model + per-task approval.
  "VISUAL_DESIGN",
  "IMAGE_GENERATION",
  "VIDEO_GENERATION",
  "AUDIO_PRODUCTION",
  "PRESENTATION_DESIGN",
  "TRANSLATION_LOCALISATION",
  "CHANNEL_ADAPTATION",
] as const;

export type AITaskType = (typeof AI_TASK_TYPES)[number];
