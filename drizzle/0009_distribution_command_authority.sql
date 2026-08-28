DO $$ BEGIN
 CREATE TYPE "distribution_provider_status" AS ENUM('NOT_CONFIGURED', 'AVAILABLE', 'DISABLED', 'DEGRADED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "distribution_provider_mode" AS ENUM('SIMULATED', 'SANDBOX', 'LIVE');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "execution_request_event" AS ENUM('REQUESTED', 'APPROVED', 'STARTED', 'PAUSED', 'FAILED', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "distribution_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_key" text NOT NULL,
  "display_name" text NOT NULL,
  "adapter_key" text NOT NULL,
  "supported_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "allowed_modes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "adapter_implemented" boolean DEFAULT false NOT NULL,
  "credentials_configured" boolean DEFAULT false NOT NULL,
  "approved" boolean DEFAULT false NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "status" "distribution_provider_status" DEFAULT 'NOT_CONFIGURED' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "distribution_providers_key_idx" ON "distribution_providers" USING btree ("provider_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "distribution_execution_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "distribution_plan_id" uuid NOT NULL,
  "market_asset_id" uuid NOT NULL,
  "provider_id" uuid NOT NULL,
  "budget_approval_id" uuid NOT NULL,
  "mode" "distribution_provider_mode" NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "requested_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "distribution_execution_request_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "event" "execution_request_event" NOT NULL,
  "reason" text,
  "actor_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "distribution_execution_requests" ADD CONSTRAINT "distribution_execution_requests_plan_fk" FOREIGN KEY ("distribution_plan_id") REFERENCES "distribution_plans"("id") ON DELETE restrict; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "distribution_execution_requests" ADD CONSTRAINT "distribution_execution_requests_asset_fk" FOREIGN KEY ("market_asset_id") REFERENCES "market_assets"("id") ON DELETE restrict; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "distribution_execution_requests" ADD CONSTRAINT "distribution_execution_requests_provider_fk" FOREIGN KEY ("provider_id") REFERENCES "distribution_providers"("id") ON DELETE restrict; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "distribution_execution_requests" ADD CONSTRAINT "distribution_execution_requests_budget_fk" FOREIGN KEY ("budget_approval_id") REFERENCES "budget_approvals"("id") ON DELETE restrict; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "distribution_execution_requests" ADD CONSTRAINT "distribution_execution_requests_user_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE restrict; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "distribution_execution_request_events" ADD CONSTRAINT "distribution_execution_request_events_request_fk" FOREIGN KEY ("request_id") REFERENCES "distribution_execution_requests"("id") ON DELETE restrict; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "distribution_execution_request_events" ADD CONSTRAINT "distribution_execution_request_events_user_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE restrict; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_distribution_execution_request_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'distribution execution requests are append-only'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS distribution_execution_requests_append_only ON "distribution_execution_requests";
--> statement-breakpoint
CREATE TRIGGER distribution_execution_requests_append_only BEFORE UPDATE OR DELETE ON "distribution_execution_requests" FOR EACH ROW EXECUTE FUNCTION reject_distribution_execution_request_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_distribution_execution_request_event_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'distribution execution request evidence is append-only'; END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS distribution_execution_request_events_append_only ON "distribution_execution_request_events";
--> statement-breakpoint
CREATE TRIGGER distribution_execution_request_events_append_only BEFORE UPDATE OR DELETE ON "distribution_execution_request_events" FOR EACH ROW EXECUTE FUNCTION reject_distribution_execution_request_event_mutation();
--> statement-breakpoint
INSERT INTO "distribution_providers" ("provider_key","display_name","adapter_key","supported_channels","allowed_modes","adapter_implemented","credentials_configured","approved","enabled","status","notes") VALUES
('simulated_internal','SecurePay Simulated Distribution','simulated','["GOOGLE_SEARCH","GOOGLE_DISPLAY","YOUTUBE","META_FACEBOOK","META_INSTAGRAM","TIKTOK","LINKEDIN","X","DIRECT_BUSINESS_OUTREACH","EMAIL","WHATSAPP","IN_APP","PARTNER_PLATFORM"]'::jsonb,'["SIMULATED"]'::jsonb,true,true,true,true,'AVAILABLE','Deterministic non-market adapter for validation and rehearsal only.'),
('google_ads','Google Ads','google_ads','["GOOGLE_SEARCH","GOOGLE_DISPLAY","YOUTUBE"]'::jsonb,'["SANDBOX","LIVE"]'::jsonb,true,false,true,false,'NOT_CONFIGURED','Boundary exists; credentials and explicit activation are required before execution.'),
('meta_ads','Meta Ads','meta_ads','["META_FACEBOOK","META_INSTAGRAM"]'::jsonb,'["SANDBOX","LIVE"]'::jsonb,true,false,true,false,'NOT_CONFIGURED','Boundary exists; credentials and explicit activation are required before execution.'),
('whatsapp_business','WhatsApp Business Messaging','whatsapp_business','["WHATSAPP"]'::jsonb,'["SANDBOX","LIVE"]'::jsonb,false,false,false,false,'NOT_CONFIGURED','Provider boundary reserved; no production adapter implemented.'),
('email_provider','Email Delivery','email_provider','["EMAIL"]'::jsonb,'["SANDBOX","LIVE"]'::jsonb,false,false,false,false,'NOT_CONFIGURED','Provider boundary reserved; no production adapter implemented.'),
('sms_provider','SMS Delivery','sms_provider','["DIRECT_BUSINESS_OUTREACH"]'::jsonb,'["SANDBOX","LIVE"]'::jsonb,false,false,false,false,'NOT_CONFIGURED','Provider boundary reserved; no production adapter implemented.'),
('owned_social','Owned Social Publishing','owned_social','["X","LINKEDIN","TIKTOK"]'::jsonb,'["SANDBOX","LIVE"]'::jsonb,false,false,false,false,'NOT_CONFIGURED','Provider boundary reserved; no production adapter implemented.'),
('partner_platform','Partner Platform Distribution','partner_platform','["PARTNER_PLATFORM"]'::jsonb,'["SANDBOX","LIVE"]'::jsonb,false,false,false,false,'NOT_CONFIGURED','Future-channel plug-in boundary.')
ON CONFLICT ("provider_key") DO NOTHING;
