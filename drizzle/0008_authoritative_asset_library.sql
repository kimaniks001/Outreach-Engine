DO $$ BEGIN
 CREATE TYPE "market_asset_kind" AS ENUM('SOCIAL_POST', 'WHATSAPP_MESSAGE', 'POSTER_COPY', 'FLYER_COPY', 'VIDEO_SCRIPT', 'TALKING_POINTS');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "market_asset_state_action" AS ENUM('RELEASED', 'SUPERSEDED', 'REVOKED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_key" text NOT NULL,
  "version" integer NOT NULL,
  "campaign_id" uuid NOT NULL,
  "creative_variant_id" uuid NOT NULL,
  "market_release_id" uuid NOT NULL,
  "kind" "market_asset_kind" NOT NULL,
  "title" text NOT NULL,
  "locale" text DEFAULT 'en-KE' NOT NULL,
  "approved_content" jsonb NOT NULL,
  "usage_guidance" text,
  "released_by_user_id" uuid NOT NULL,
  "released_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "market_assets_key_version_idx" ON "market_assets" USING btree ("asset_key","version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_asset_state_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL,
  "action" "market_asset_state_action" NOT NULL,
  "reason" text,
  "actor_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_assets" ADD CONSTRAINT "market_assets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_assets" ADD CONSTRAINT "market_assets_creative_variant_id_creative_variants_id_fk" FOREIGN KEY ("creative_variant_id") REFERENCES "creative_variants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_assets" ADD CONSTRAINT "market_assets_market_release_id_market_release_records_id_fk" FOREIGN KEY ("market_release_id") REFERENCES "market_release_records"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_assets" ADD CONSTRAINT "market_assets_released_by_user_id_users_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_asset_state_events" ADD CONSTRAINT "market_asset_state_events_asset_id_market_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "market_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_asset_state_events" ADD CONSTRAINT "market_asset_state_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_market_asset_content_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'approved market asset content is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS market_assets_append_only ON "market_assets";
--> statement-breakpoint
CREATE TRIGGER market_assets_append_only BEFORE UPDATE OR DELETE ON "market_assets"
FOR EACH ROW EXECUTE FUNCTION reject_market_asset_content_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_market_asset_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'market asset state evidence is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS market_asset_state_events_append_only ON "market_asset_state_events";
--> statement-breakpoint
CREATE TRIGGER market_asset_state_events_append_only BEFORE UPDATE OR DELETE ON "market_asset_state_events"
FOR EACH ROW EXECUTE FUNCTION reject_market_asset_event_mutation();
