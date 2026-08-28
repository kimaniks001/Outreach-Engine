import { pgEnum, pgTable, uuid, text, boolean, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users, distributionPlans, budgetApprovals } from "@/lib/db/schema";
import { marketAssets } from "@/lib/assets/schema";

export const distributionProviderStatusEnum = pgEnum("distribution_provider_status", [
  "NOT_CONFIGURED",
  "AVAILABLE",
  "DISABLED",
  "DEGRADED",
]);

export const distributionProviderModeEnum = pgEnum("distribution_provider_mode", [
  "SIMULATED",
  "SANDBOX",
  "LIVE",
]);

export const executionRequestEventEnum = pgEnum("execution_request_event", [
  "REQUESTED",
  "APPROVED",
  "STARTED",
  "PAUSED",
  "FAILED",
  "CANCELLED",
  "COMPLETED",
]);

// No provider credentials are stored here. This is a readiness/control
// registry only: what boundary exists, what channels it may serve, and
// whether SecurePay has explicitly enabled it.
export const distributionProviders = pgTable(
  "distribution_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerKey: text("provider_key").notNull(),
    displayName: text("display_name").notNull(),
    adapterKey: text("adapter_key").notNull(),
    supportedChannels: jsonb("supported_channels").$type<string[]>().notNull().default([]),
    allowedModes: jsonb("allowed_modes").$type<Array<"SIMULATED" | "SANDBOX" | "LIVE">>().notNull().default([]),
    adapterImplemented: boolean("adapter_implemented").notNull().default(false),
    credentialsConfigured: boolean("credentials_configured").notNull().default(false),
    approved: boolean("approved").notNull().default(false),
    enabled: boolean("enabled").notNull().default(false),
    status: distributionProviderStatusEnum("status").notNull().default("NOT_CONFIGURED"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ providerKeyIdx: uniqueIndex("distribution_providers_key_idx").on(table.providerKey) })
);

// Immutable execution intent. It binds the distribution plan to one exact
// approved Market Asset, provider, current approved budget, and time window.
// State transitions are stored separately as append-only evidence.
export const distributionExecutionRequests = pgTable("distribution_execution_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  distributionPlanId: uuid("distribution_plan_id")
    .notNull()
    .references(() => distributionPlans.id, { onDelete: "restrict" }),
  marketAssetId: uuid("market_asset_id")
    .notNull()
    .references(() => marketAssets.id, { onDelete: "restrict" }),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => distributionProviders.id, { onDelete: "restrict" }),
  budgetApprovalId: uuid("budget_approval_id")
    .notNull()
    .references(() => budgetApprovals.id, { onDelete: "restrict" }),
  mode: distributionProviderModeEnum("mode").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  requestedByUserId: uuid("requested_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const distributionExecutionRequestEvents = pgTable("distribution_execution_request_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => distributionExecutionRequests.id, { onDelete: "restrict" }),
  event: executionRequestEventEnum("event").notNull(),
  reason: text("reason"),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DistributionProvider = typeof distributionProviders.$inferSelect;
export type DistributionExecutionRequest = typeof distributionExecutionRequests.$inferSelect;
