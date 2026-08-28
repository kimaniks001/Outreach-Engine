DO $$ BEGIN
  CREATE TYPE "claim_source_type" AS ENUM ('DOCTRINE','TERMS','PRICING','PRODUCT_AUTHORITY','LEGAL_APPROVAL','POLICY','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "claim_source_status" AS ENUM ('CURRENT','SUPERSEDED','RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "market_review_lane" AS ENUM ('BRAND_CLAIMS','COMPLIANCE_LEGAL','FINAL_MARKET_RELEASE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "market_review_action" AS ENUM ('APPROVE','REJECT','REVISION_REQUIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "claim_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_key" text NOT NULL,
  "title" text NOT NULL,
  "source_type" "claim_source_type" NOT NULL,
  "version" text NOT NULL,
  "source_reference" text NOT NULL,
  "content_digest" text,
  "status" "claim_source_status" DEFAULT 'CURRENT' NOT NULL,
  "effective_from" timestamp with time zone,
  "effective_until" timestamp with time zone,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "claim_sources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "claim_sources_key_version_idx" ON "claim_sources" USING btree ("source_key","version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_claim_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "claim_source_id" uuid NOT NULL,
  "note" text,
  "attached_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "campaign_claim_sources_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade,
  CONSTRAINT "campaign_claim_sources_claim_source_id_claim_sources_id_fk" FOREIGN KEY ("claim_source_id") REFERENCES "public"."claim_sources"("id") ON DELETE restrict,
  CONSTRAINT "campaign_claim_sources_attached_by_user_id_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_claim_sources_campaign_source_idx" ON "campaign_claim_sources" USING btree ("campaign_id","claim_source_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_review_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "lane" "market_review_lane" NOT NULL,
  "action" "market_review_action" NOT NULL,
  "content_fingerprint" text NOT NULL,
  "source_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "actor_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "market_review_decisions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict,
  CONSTRAINT "market_review_decisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_release_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "release_version" integer NOT NULL,
  "content_fingerprint" text NOT NULL,
  "source_snapshot" jsonb NOT NULL,
  "creative_snapshot" jsonb NOT NULL,
  "brand_decision_id" uuid NOT NULL,
  "compliance_decision_id" uuid,
  "final_release_decision_id" uuid NOT NULL,
  "released_by_user_id" uuid NOT NULL,
  "released_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "market_release_records_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict,
  CONSTRAINT "market_release_records_brand_decision_id_market_review_decisions_id_fk" FOREIGN KEY ("brand_decision_id") REFERENCES "public"."market_review_decisions"("id") ON DELETE restrict,
  CONSTRAINT "market_release_records_compliance_decision_id_market_review_decisions_id_fk" FOREIGN KEY ("compliance_decision_id") REFERENCES "public"."market_review_decisions"("id") ON DELETE restrict,
  CONSTRAINT "market_release_records_final_release_decision_id_market_review_decisions_id_fk" FOREIGN KEY ("final_release_decision_id") REFERENCES "public"."market_review_decisions"("id") ON DELETE restrict,
  CONSTRAINT "market_release_records_released_by_user_id_users_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "market_release_records_campaign_version_idx" ON "market_release_records" USING btree ("campaign_id","release_version");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_market_approval_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'market approval evidence is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS market_review_decisions_append_only ON market_review_decisions;
--> statement-breakpoint
CREATE TRIGGER market_review_decisions_append_only BEFORE UPDATE OR DELETE ON market_review_decisions FOR EACH ROW EXECUTE FUNCTION reject_market_approval_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS market_release_records_append_only ON market_release_records;
--> statement-breakpoint
CREATE TRIGGER market_release_records_append_only BEFORE UPDATE OR DELETE ON market_release_records FOR EACH ROW EXECUTE FUNCTION reject_market_approval_mutation();
