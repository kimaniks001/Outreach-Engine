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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AiProvider = typeof aiProviders.$inferSelect;
export type AiModel = typeof aiModels.$inferSelect;
export type AiUsageRecord = typeof aiUsageRecords.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type SystemSetting = typeof systemSettings.$inferSelect;
