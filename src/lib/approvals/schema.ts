import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users, campaigns } from "@/lib/db/schema";

export const claimSourceTypeEnum = pgEnum("claim_source_type", [
  "DOCTRINE",
  "TERMS",
  "PRICING",
  "PRODUCT_AUTHORITY",
  "LEGAL_APPROVAL",
  "POLICY",
  "OTHER",
]);

export const claimSourceStatusEnum = pgEnum("claim_source_status", [
  "CURRENT",
  "SUPERSEDED",
  "RETIRED",
]);

export const marketReviewLaneEnum = pgEnum("market_review_lane", [
  "BRAND_CLAIMS",
  "COMPLIANCE_LEGAL",
  "FINAL_MARKET_RELEASE",
]);

export const marketReviewActionEnum = pgEnum("market_review_action", [
  "APPROVE",
  "REJECT",
  "REVISION_REQUIRED",
]);

// References only. Outreach does not copy authoritative legal/product
// documents into this table and never turns an AI answer into a source of
// truth. The digest lets an approval snapshot prove which exact source
// revision was relied upon when an asset was released.
export const claimSources = pgTable(
  "claim_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKey: text("source_key").notNull(),
    title: text("title").notNull(),
    sourceType: claimSourceTypeEnum("source_type").notNull(),
    version: text("version").notNull(),
    sourceReference: text("source_reference").notNull(),
    contentDigest: text("content_digest"),
    status: claimSourceStatusEnum("status").notNull().default("CURRENT"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceVersionIdx: uniqueIndex("claim_sources_key_version_idx").on(table.sourceKey, table.version),
  })
);

export const campaignClaimSources = pgTable(
  "campaign_claim_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    claimSourceId: uuid("claim_source_id")
      .notNull()
      .references(() => claimSources.id, { onDelete: "restrict" }),
    note: text("note"),
    attachedByUserId: uuid("attached_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campaignSourceIdx: uniqueIndex("campaign_claim_sources_campaign_source_idx").on(
      table.campaignId,
      table.claimSourceId
    ),
  })
);

// Append-only human decisions. contentFingerprint binds a decision to the
// exact campaign + creative content that the reviewer saw. A later edit does
// not inherit this approval.
export const marketReviewDecisions = pgTable("market_review_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "restrict" }),
  lane: marketReviewLaneEnum("lane").notNull(),
  action: marketReviewActionEnum("action").notNull(),
  contentFingerprint: text("content_fingerprint").notNull(),
  sourceSnapshot: jsonb("source_snapshot").$type<ClaimSourceSnapshot[]>().notNull().default([]),
  notes: text("notes"),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One immutable proof package per market release. Distribution and the Plug
// Market Kit must consume a release that still matches current content; the
// existence of an old READY_FOR_DISTRIBUTION status is never sufficient.
export const marketReleaseRecords = pgTable(
  "market_release_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    releaseVersion: integer("release_version").notNull(),
    contentFingerprint: text("content_fingerprint").notNull(),
    sourceSnapshot: jsonb("source_snapshot").$type<ClaimSourceSnapshot[]>().notNull(),
    creativeSnapshot: jsonb("creative_snapshot").$type<CreativeSnapshot[]>().notNull(),
    brandDecisionId: uuid("brand_decision_id")
      .notNull()
      .references(() => marketReviewDecisions.id, { onDelete: "restrict" }),
    complianceDecisionId: uuid("compliance_decision_id").references(() => marketReviewDecisions.id, {
      onDelete: "restrict",
    }),
    finalReleaseDecisionId: uuid("final_release_decision_id")
      .notNull()
      .references(() => marketReviewDecisions.id, { onDelete: "restrict" }),
    releasedByUserId: uuid("released_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campaignVersionIdx: uniqueIndex("market_release_records_campaign_version_idx").on(
      table.campaignId,
      table.releaseVersion
    ),
  })
);

export interface ClaimSourceSnapshot {
  id: string;
  sourceKey: string;
  title: string;
  sourceType: string;
  version: string;
  sourceReference: string;
  contentDigest: string | null;
  status: string;
}

export interface CreativeSnapshot {
  id: string;
  variantLabel: string;
  fingerprint: string;
}

export type ClaimSource = typeof claimSources.$inferSelect;
export type MarketReviewDecision = typeof marketReviewDecisions.$inferSelect;
export type MarketReleaseRecord = typeof marketReleaseRecords.$inferSelect;
