import { pgEnum, pgTable, uuid, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users, campaigns, creativeVariants } from "@/lib/db/schema";
import { marketReleaseRecords } from "@/lib/approvals/schema";

export const marketAssetKindEnum = pgEnum("market_asset_kind", [
  "SOCIAL_POST",
  "WHATSAPP_MESSAGE",
  "POSTER_COPY",
  "FLYER_COPY",
  "VIDEO_SCRIPT",
  "TALKING_POINTS",
]);

export const marketAssetStateActionEnum = pgEnum("market_asset_state_action", [
  "RELEASED",
  "SUPERSEDED",
  "REVOKED",
]);

export interface ApprovedAssetContent {
  headline: string;
  body: string;
  cta: string;
  imageConcept: string;
  angle: string;
  rationale: string;
}

// Immutable content package derived from one exact current Market Release.
// The Asset Library is not an alternate copy editor: content is projected
// from an already-approved creative variant, then frozen here.
export const marketAssets = pgTable(
  "market_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetKey: text("asset_key").notNull(),
    version: integer("version").notNull(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    creativeVariantId: uuid("creative_variant_id")
      .notNull()
      .references(() => creativeVariants.id, { onDelete: "restrict" }),
    marketReleaseId: uuid("market_release_id")
      .notNull()
      .references(() => marketReleaseRecords.id, { onDelete: "restrict" }),
    kind: marketAssetKindEnum("kind").notNull(),
    title: text("title").notNull(),
    locale: text("locale").notNull().default("en-KE"),
    approvedContent: jsonb("approved_content").$type<ApprovedAssetContent>().notNull(),
    usageGuidance: text("usage_guidance"),
    releasedByUserId: uuid("released_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyVersionIdx: uniqueIndex("market_assets_key_version_idx").on(table.assetKey, table.version),
  })
);

// Append-only state trail. Superseding/revoking never mutates the approved
// content record, preserving exactly what was handed to the market.
export const marketAssetStateEvents = pgTable("market_asset_state_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => marketAssets.id, { onDelete: "restrict" }),
  action: marketAssetStateActionEnum("action").notNull(),
  reason: text("reason"),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MarketAsset = typeof marketAssets.$inferSelect;
export type MarketAssetStateEvent = typeof marketAssetStateEvents.$inferSelect;
