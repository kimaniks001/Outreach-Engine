import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Matches docs/ACCESS_CONTROL_MODEL.md Section 2. Do not add roles here
// without updating src/lib/rbac/permissions.ts and the doctrine document.
export const roleEnum = pgEnum("role", [
  "OWNER",
  "GROWTH_DIRECTOR",
  "STRATEGIST",
  "CONTENT_ENGAGEMENT",
  "DISTRIBUTION_SALES",
  "ANALYST",
]);

// Matches docs/DATA_CLASSIFICATION.md Section 2.
export const classificationEnum = pgEnum("classification", [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
]);

// Matters for docs/MODEL_CONTROL_PLANE.md Section 4 — a provider is only
// AVAILABLE when adapter + credentials + approval all hold. This column is
// a cached/derived display value; src/lib/ai/registry.ts recomputes it.
export const providerStatusEnum = pgEnum("provider_status", [
  "NOT_CONFIGURED",
  "AVAILABLE",
  "DISABLED",
  "DEGRADED",
]);

export const modelStatusEnum = pgEnum("model_status", [
  "APPROVED",
  "PENDING_REVIEW",
  "DEPRECATED",
]);

// Matches docs/AUDIT_AND_CONTROL.md Section 4.
export const safeModeEnum = pgEnum("safe_mode_state", ["NORMAL", "SAFE_MODE"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  })
);

// Provider definitions only (docs/MODEL_CONTROL_PLANE.md Section 4 /
// docs/AI_GOVERNANCE.md). No credential *values* are ever stored here —
// credentialsConfigured reflects whether the corresponding env var is set.
export const aiProviders = pgTable(
  "ai_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(), // e.g. "anthropic" | "openai" | "google"
    displayName: text("display_name").notNull(),
    status: providerStatusEnum("status").notNull().default("NOT_CONFIGURED"),
    adapterImplemented: boolean("adapter_implemented").notNull().default(false),
    credentialsConfigured: boolean("credentials_configured").notNull().default(false),
    enabled: boolean("enabled").notNull().default(false),
    // Phase 2: a mock/deterministic provider that needs no credentials, so
    // the app stays usable without live AI access. Never shown as a normal
    // AVAILABLE connection in the UI — always badged distinctly. See
    // docs/PHASE_2_AI_PROVIDER_INTEGRATION.md.
    isMock: boolean("is_mock").notNull().default(false),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("ai_providers_key_idx").on(table.key),
  })
);

// docs/MODEL_CONTROL_PLANE.md Section 5 metadata. Model identity itself is
// data, not doctrine — see docs/PHASE_1_COMMAND_CENTRE_AND_AI_CORE.md.
export const aiModels = pgTable(
  "ai_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "cascade" }),
    modelKey: text("model_key").notNull(),
    displayName: text("display_name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    approved: boolean("approved").notNull().default(false),
    status: modelStatusEnum("status").notNull().default("PENDING_REVIEW"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    approvedTaskTypes: jsonb("approved_task_types").$type<string[]>().notNull().default([]),
    contextWindowTokens: integer("context_window_tokens"),
    structuredOutputSupport: boolean("structured_output_support").notNull().default(false),
    costInputPer1kUsd: numeric("cost_input_per_1k_usd", { precision: 10, scale: 5 }),
    costOutputPer1kUsd: numeric("cost_output_per_1k_usd", { precision: 10, scale: 5 }),
    qualityScore: numeric("quality_score", { precision: 4, scale: 3 }),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerModelIdx: uniqueIndex("ai_models_provider_model_idx").on(
      table.providerId,
      table.modelKey
    ),
  })
);

// docs/MODEL_CONTROL_PLANE.md Section 6/7 — per-task execution record.
export const aiUsageRecords = pgTable("ai_usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskType: text("task_type").notNull(),
  providerId: uuid("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
  modelId: uuid("model_id").references(() => aiModels.id, { onDelete: "set null" }),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  success: boolean("success").notNull(),
  routingReason: text("routing_reason").notNull(),
  latencyMs: integer("latency_ms"),
  inputUnits: integer("input_units"),
  outputUnits: integer("output_units"),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 5 }),
  correlationId: text("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// docs/AUDIT_AND_CONTROL.md — simple append-only event log.
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorLabel: text("actor_label"), // fallback label when there is no user (e.g. failed login email)
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Simple key/value settings table. Safe Mode (docs/AUDIT_AND_CONTROL.md
// Section 4) is the only setting Phase 1 needs; this stays generic so more
// settings can be added later without a new table.
export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

// ============================================================
// PHASE 2 — Intelligence + Campaign + Creative
// ============================================================

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 7 (brief Section 7).
export const signalTypeEnum = pgEnum("signal_type", [
  "WEB",
  "NEWS",
  "SOCIAL",
  "INDUSTRY",
  "GOVERNMENT",
  "COMPETITOR",
  "CUSTOMER_FEEDBACK",
  "INTERNAL_OBSERVATION",
  "MANUAL",
]);

export const signalStatusEnum = pgEnum("signal_status", ["NEW", "ANALYZED", "ARCHIVED"]);

// docs/SOURCE_PROVENANCE.md Section 3 — exact match, do not add states here.
export const verificationStatusEnum = pgEnum("verification_status", [
  "VERIFIED",
  "NEEDS_REVIEW",
  "WEAK_EVIDENCE",
  "REJECTED",
]);

export const evidenceSourceTypeEnum = pgEnum("evidence_source_type", [
  "NEWS_ARTICLE",
  "INDUSTRY_REPORT",
  "SOCIAL_POST",
  "DIRECT_INTERVIEW",
  "INTERNAL_DATA",
  "GOVERNMENT_PUBLICATION",
  "MANUAL_OBSERVATION",
  "OTHER",
]);

export const marketSignals = pgTable("market_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  signalType: signalTypeEnum("signal_type").notNull(),
  status: signalStatusEnum("status").notNull().default("NEW"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  notes: text("notes"),
  classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  // Phase 2 brief Section 29 — demo data must be visibly distinguishable
  // from live intelligence everywhere it appears (list, detail, downstream
  // opportunities/campaigns copy this flag forward at creation time).
  isDemo: boolean("is_demo").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// docs/SOURCE_PROVENANCE.md Section 2 — required provenance fields. A
// signal with zero rows here is MANUAL/UNVERIFIED by construction (no row
// to claim otherwise) — see src/lib/intelligence/evidence.ts.
export const sourceEvidence = pgTable("source_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketSignalId: uuid("market_signal_id")
    .notNull()
    .references(() => marketSignals.id, { onDelete: "cascade" }),
  sourceName: text("source_name").notNull(),
  sourceReference: text("source_reference"),
  sourceType: evidenceSourceTypeEnum("source_type").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  extractedClaim: text("extracted_claim").notNull(),
  evidenceSnippet: text("evidence_snippet"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("NEEDS_REVIEW"),
  contradictionsNotes: text("contradictions_notes"),
  classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "DRAFT",
  "NEEDS_REVIEW",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
]);

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 11 — the ONLY four
// money-flow concepts this system is authorized to map an opportunity to.
// See src/lib/opportunity/money-flow.ts. Do not add values here without
// authoritative SecurePay product doctrine — use NEEDS_DOCTRINE_REVIEW.
export const moneyFlowMappingEnum = pgEnum("money_flow_mapping", [
  "ONE_TO_ONE",
  "MANY_TO_ONE",
  "ONE_TO_MANY",
  "MANY_TO_MANY",
  "NEEDS_DOCTRINE_REVIEW",
]);

export const urgencyEnum = pgEnum("urgency", ["LOW", "MEDIUM", "HIGH"]);

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketSignalId: uuid("market_signal_id")
    .notNull()
    .references(() => marketSignals.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  problem: text("problem").notNull(),
  targetAudience: text("target_audience").notNull(),
  affectedSector: text("affected_sector"),
  geography: text("geography"),
  securepayRelevance: text("securepay_relevance").notNull(),
  moneyFlowMapping: moneyFlowMappingEnum("money_flow_mapping").notNull(),
  productNote: text("product_note"),
  evidenceSummary: text("evidence_summary").notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  opportunityScore: integer("opportunity_score").notNull(),
  urgency: urgencyEnum("urgency").notNull().default("MEDIUM"),
  estimatedCommercialPotential: text("estimated_commercial_potential"),
  recommendedMarketingAngle: text("recommended_marketing_angle"),
  recommendedCta: text("recommended_cta"),
  risksCaveats: text("risks_caveats"),
  status: opportunityStatusEnum("status").notNull().default("DRAFT"),
  aiUsageRecordId: uuid("ai_usage_record_id").references(() => aiUsageRecords.id, {
    onDelete: "set null",
  }),
  classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 10 — transparent,
// explainable scoring. One current breakdown per opportunity (re-scoring
// overwrites, it does not silently hide the previous explanation — see
// src/lib/opportunity/scoring.ts).
export const opportunityScores = pgTable(
  "opportunity_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    problemFit: integer("problem_fit").notNull(),
    securepayFit: integer("securepay_fit").notNull(),
    audienceClarity: integer("audience_clarity").notNull(),
    commercialValue: integer("commercial_value").notNull(),
    reachability: integer("reachability").notNull(),
    evidenceStrength: integer("evidence_strength").notNull(),
    urgencyTiming: integer("urgency_timing").notNull(),
    totalScore: integer("total_score").notNull(),
    explanation: jsonb("explanation").$type<Record<string, string>>().notNull().default({}),
    aiProposed: boolean("ai_proposed").notNull().default(false),
    scoredByUserId: uuid("scored_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    opportunityIdx: uniqueIndex("opportunity_scores_opportunity_idx").on(table.opportunityId),
  })
);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "IDEA",
  "DRAFT",
  "BRAND_REVIEW",
  "NEEDS_REVISION",
  "AWAITING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "READY_FOR_DISTRIBUTION",
]);

export const riskLevelEnum = pgEnum("risk_level", ["LOW", "MEDIUM", "HIGH"]);

export const brandGuardianStatusEnum = pgEnum("brand_guardian_status", [
  "NOT_REVIEWED",
  "PASS",
  "REVISE",
  "BLOCK",
]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  targetAudience: text("target_audience").notNull(),
  positioningAngle: text("positioning_angle").notNull(),
  coreMessage: text("core_message").notNull(),
  recommendedChannelTypes: jsonb("recommended_channel_types")
    .$type<string[]>()
    .notNull()
    .default([]),
  cta: text("cta").notNull(),
  destinationConcept: text("destination_concept"),
  creativeBrief: text("creative_brief"),
  riskLevel: riskLevelEnum("risk_level").notNull().default("HIGH"), // public campaigns are HIGH risk by default — see docs/AI_GOVERNANCE.md Section 4
  brandGuardianStatus: brandGuardianStatusEnum("brand_guardian_status")
    .notNull()
    .default("NOT_REVIEWED"),
  status: campaignStatusEnum("status").notNull().default("IDEA"),
  aiUsageRecordId: uuid("ai_usage_record_id").references(() => aiUsageRecords.id, {
    onDelete: "set null",
  }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 17 — image-first,
// max 3 per generation action (enforced in src/lib/creative, not here).
export const creativeVariants = pgTable("creative_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  variantLabel: text("variant_label").notNull(), // e.g. "A"
  angle: text("angle").notNull(), // e.g. "Problem-led"
  headline: text("headline").notNull(),
  body: text("body").notNull(),
  cta: text("cta").notNull(),
  imageConcept: text("image_concept").notNull(), // visual direction / creative brief, not a generated image
  aspectRatioSuggestions: jsonb("aspect_ratio_suggestions")
    .$type<string[]>()
    .notNull()
    .default(["square", "portrait", "landscape"]),
  carouselConcept: text("carousel_concept"),
  demoConceptNote: text("demo_concept_note"),
  rationale: text("rationale").notNull(),
  brandGuardianStatus: brandGuardianStatusEnum("brand_guardian_status")
    .notNull()
    .default("NOT_REVIEWED"),
  aiUsageRecordId: uuid("ai_usage_record_id").references(() => aiUsageRecords.id, {
    onDelete: "set null",
  }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brandReviewSubjectEnum = pgEnum("brand_review_subject", [
  "campaign",
  "creative_variant",
  "distribution_plan",
]);

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 13. subjectId is
// intentionally polymorphic (campaign or creative_variant) rather than two
// nullable FK columns — kept simple per the brief's "no over-engineering"
// instruction; see that document for the trade-off this accepts.
export const brandReviews = pgTable("brand_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: brandReviewSubjectEnum("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  result: brandGuardianStatusEnum("result").notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  offendingStatements: jsonb("offending_statements").$type<string[]>().notNull().default([]),
  recommendedCorrection: text("recommended_correction"),
  doctrineReferences: jsonb("doctrine_references").$type<string[]>().notNull().default([]),
  ruleEngineVersion: text("rule_engine_version").notNull(),
  aiEnrichmentUsed: boolean("ai_enrichment_used").notNull().default(false),
  aiUsageRecordId: uuid("ai_usage_record_id").references(() => aiUsageRecords.id, {
    onDelete: "set null",
  }),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvalSubjectEnum = pgEnum("approval_subject", [
  "opportunity",
  "campaign",
  "audience_segment",
  "distribution_plan",
]);
export const approvalActionEnum = pgEnum("approval_action", [
  "APPROVE",
  "REJECT",
  "REVISION_REQUESTED",
]);

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 15 — append-only,
// mirrors the audit log's philosophy but scoped to approval decisions
// specifically so approval history is easy to query per subject.
export const approvalEvents = pgTable("approval_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: approvalSubjectEnum("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  action: approvalActionEnum("action").notNull(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// PHASE 3 — Targeting + Distribution
// ============================================================

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 10 — planning/channel
// types only. Actual live adapter support is separate (src/lib/distribution)
// and, in this phase, limited to the SIMULATED adapter — see that document.
export const channelTypeEnum = pgEnum("channel_type", [
  "GOOGLE_SEARCH",
  "GOOGLE_DISPLAY",
  "YOUTUBE",
  "META_FACEBOOK",
  "META_INSTAGRAM",
  "TIKTOK",
  "LINKEDIN",
  "X",
  "DIRECT_BUSINESS_OUTREACH",
  "EMAIL",
  "WHATSAPP",
  "IN_APP",
  "PARTNER_PLATFORM",
]);

export const audienceSegmentStatusEnum = pgEnum("audience_segment_status", [
  "DRAFT",
  "NEEDS_REVIEW",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
]);

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 13 — LIVE is structurally
// unreachable in this phase: no adapter exists that can serve it. Default is
// always PLAN_ONLY.
export const executionModeEnum = pgEnum("execution_mode", [
  "PLAN_ONLY",
  "SIMULATED",
  "SANDBOX",
  "LIVE",
]);

export const distributionPlanStatusEnum = pgEnum("distribution_plan_status", [
  "DRAFT",
  "NEEDS_REVIEW",
  "AWAITING_APPROVAL",
  "APPROVED",
  "READY",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const distributionExecutionStatusEnum = pgEnum("distribution_execution_status", [
  "PENDING",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

// Append-only per distribution plan — the current effective budget is the
// latest APPROVED row not superseded by a later PROPOSED row. See
// src/lib/distribution/budget-guard.ts.
export const budgetApprovalStatusEnum = pgEnum("budget_approval_status", [
  "PROPOSED",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
]);

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 7 — targeting commercial
// situations and intent only. AI proposals are re-validated server-side by
// src/lib/audience/targeting-guard.ts before being written, regardless of
// what a model proposed.
export const audienceSegments = pgTable("audience_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  linkedCampaignId: uuid("linked_campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "restrict" }),
  sector: text("sector"),
  geography: text("geography"),
  businessCriteria: text("business_criteria"),
  roleFunctionCriteria: text("role_function_criteria"),
  companyCriteria: text("company_criteria"),
  intentCriteria: text("intent_criteria"),
  channelEligibility: jsonb("channel_eligibility").$type<string[]>().notNull().default([]),
  // Free text on purpose — a placeholder or a known value, never a
  // fabricated number. See docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md
  // Section 7.
  estimatedReach: text("estimated_reach"),
  status: audienceSegmentStatusEnum("status").notNull().default("DRAFT"),
  classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 8 — mirrors
// opportunity_scores exactly: transparent, explainable, no ML. One current
// row per segment; re-scoring overwrites via upsert, same as opportunities.
export const audienceScores = pgTable(
  "audience_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    audienceSegmentId: uuid("audience_segment_id")
      .notNull()
      .references(() => audienceSegments.id, { onDelete: "cascade" }),
    problemFit: integer("problem_fit").notNull(),
    productFit: integer("product_fit").notNull(),
    intent: integer("intent").notNull(),
    reachability: integer("reachability").notNull(),
    commercialValue: integer("commercial_value").notNull(),
    evidenceStrength: integer("evidence_strength").notNull(),
    channelFit: integer("channel_fit"),
    totalScore: integer("total_score").notNull(),
    explanation: jsonb("explanation").$type<Record<string, string>>().notNull().default({}),
    aiProposed: boolean("ai_proposed").notNull().default(false),
    scoredByUserId: uuid("scored_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    audienceSegmentIdx: uniqueIndex("audience_scores_segment_idx").on(table.audienceSegmentId),
  })
);

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 11 — deterministic rule
// engine output. Append-only (re-running generates a fresh set, same
// non-destructive pattern as brand_reviews) so recommendation history is
// preserved.
export const channelRecommendations = pgTable("channel_recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  audienceSegmentId: uuid("audience_segment_id")
    .notNull()
    .references(() => audienceSegments.id, { onDelete: "cascade" }),
  channel: channelTypeEnum("channel").notNull(),
  priority: integer("priority").notNull(),
  rationale: text("rationale").notNull(),
  expectedFunnelRole: text("expected_funnel_role").notNull(),
  risks: jsonb("risks").$type<string[]>().notNull().default([]),
  requiredAssets: jsonb("required_assets").$type<string[]>().notNull().default([]),
  executionAvailability: text("execution_availability").notNull(),
  ruleEngineVersion: text("rule_engine_version").notNull(),
  aiEnrichmentUsed: boolean("ai_enrichment_used").notNull().default(false),
  aiUsageRecordId: uuid("ai_usage_record_id").references(() => aiUsageRecords.id, {
    onDelete: "set null",
  }),
  generatedByUserId: uuid("generated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 12. Default execution
// mode is always PLAN_ONLY; RUNNING is only reachable via a successful
// DistributionGateway.launch() call — see src/lib/distribution/plans.ts.
export const distributionPlans = pgTable("distribution_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "restrict" }),
  audienceSegmentId: uuid("audience_segment_id")
    .notNull()
    .references(() => audienceSegments.id, { onDelete: "restrict" }),
  objective: text("objective").notNull(),
  channel: channelTypeEnum("channel").notNull(),
  channelStrategy: text("channel_strategy").notNull(),
  creativeVariantIds: jsonb("creative_variant_ids").$type<string[]>().notNull().default([]),
  destination: text("destination"),
  cta: text("cta").notNull(),
  plannedBudget: numeric("planned_budget", { precision: 12, scale: 2 }),
  budgetCurrency: text("budget_currency").notNull().default("USD"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  executionMode: executionModeEnum("execution_mode").notNull().default("PLAN_ONLY"),
  riskLevel: riskLevelEnum("risk_level").notNull().default("HIGH"), // paid/outbound distribution is HIGH risk by default — docs/AI_GOVERNANCE.md Section 4
  brandGuardianStatus: brandGuardianStatusEnum("brand_guardian_status").notNull().default("NOT_REVIEWED"),
  providerAccountReference: text("provider_account_reference"),
  status: distributionPlanStatusEnum("status").notNull().default("DRAFT"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 15 — append-only history
// per plan, mirroring approval_events' philosophy. The current effective
// budget is the latest APPROVED row not superseded by a later row — see
// src/lib/distribution/budget-guard.ts. No row here is ever edited in place.
export const budgetApprovals = pgTable("budget_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  distributionPlanId: uuid("distribution_plan_id")
    .notNull()
    .references(() => distributionPlans.id, { onDelete: "cascade" }),
  plannedBudget: numeric("planned_budget", { precision: 12, scale: 2 }).notNull(),
  approvedBudget: numeric("approved_budget", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  dailyCap: numeric("daily_cap", { precision: 12, scale: 2 }),
  totalCap: numeric("total_cap", { precision: 12, scale: 2 }),
  status: budgetApprovalStatusEnum("status").notNull().default("PROPOSED"),
  providerAccountReference: text("provider_account_reference"),
  proposedByUserId: uuid("proposed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 27. isSimulated defaults
// true because the only adapter implemented in this phase is SIMULATED — see
// src/lib/distribution/adapters. externalExecutionId/reportedSpend are only
// ever populated by an adapter call, never fabricated by application code.
export const distributionExecutions = pgTable("distribution_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  distributionPlanId: uuid("distribution_plan_id")
    .notNull()
    .references(() => distributionPlans.id, { onDelete: "restrict" }),
  channel: channelTypeEnum("channel").notNull(),
  adapterKey: text("adapter_key").notNull(),
  mode: executionModeEnum("mode").notNull(),
  externalExecutionId: text("external_execution_id"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  status: distributionExecutionStatusEnum("status").notNull().default("PENDING"),
  errorCode: text("error_code"),
  normalizedError: text("normalized_error"),
  approvedBudget: numeric("approved_budget", { precision: 12, scale: 2 }),
  reportedSpend: numeric("reported_spend", { precision: 12, scale: 2 }),
  spendHistory: jsonb("spend_history").$type<Array<{ at: string; amount: number }>>().notNull().default([]),
  isSimulated: boolean("is_simulated").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AiProvider = typeof aiProviders.$inferSelect;
export type AiModel = typeof aiModels.$inferSelect;
export type AiUsageRecord = typeof aiUsageRecords.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type MarketSignal = typeof marketSignals.$inferSelect;
export type SourceEvidence = typeof sourceEvidence.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type OpportunityScore = typeof opportunityScores.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CreativeVariant = typeof creativeVariants.$inferSelect;
export type BrandReview = typeof brandReviews.$inferSelect;
export type ApprovalEvent = typeof approvalEvents.$inferSelect;
export type AudienceSegment = typeof audienceSegments.$inferSelect;
export type AudienceScore = typeof audienceScores.$inferSelect;
export type ChannelRecommendation = typeof channelRecommendations.$inferSelect;
export type DistributionPlan = typeof distributionPlans.$inferSelect;
export type BudgetApproval = typeof budgetApprovals.$inferSelect;
export type DistributionExecution = typeof distributionExecutions.$inferSelect;
