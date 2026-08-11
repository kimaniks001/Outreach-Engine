CREATE TYPE "public"."approval_action" AS ENUM('APPROVE', 'REJECT', 'REVISION_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."approval_subject" AS ENUM('opportunity', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."brand_guardian_status" AS ENUM('NOT_REVIEWED', 'PASS', 'REVISE', 'BLOCK');--> statement-breakpoint
CREATE TYPE "public"."brand_review_subject" AS ENUM('campaign', 'creative_variant');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('IDEA', 'DRAFT', 'BRAND_REVIEW', 'NEEDS_REVISION', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'READY_FOR_DISTRIBUTION');--> statement-breakpoint
CREATE TYPE "public"."evidence_source_type" AS ENUM('NEWS_ARTICLE', 'INDUSTRY_REPORT', 'SOCIAL_POST', 'DIRECT_INTERVIEW', 'INTERNAL_DATA', 'GOVERNMENT_PUBLICATION', 'MANUAL_OBSERVATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."money_flow_mapping" AS ENUM('ONE_TO_ONE', 'MANY_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_MANY', 'NEEDS_DOCTRINE_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('NEW', 'ANALYZED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."signal_type" AS ENUM('WEB', 'NEWS', 'SOCIAL', 'INDUSTRY', 'GOVERNMENT', 'COMPETITOR', 'CUSTOMER_FEEDBACK', 'INTERNAL_OBSERVATION', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('VERIFIED', 'NEEDS_REVIEW', 'WEAK_EVIDENCE', 'REJECTED');--> statement-breakpoint
CREATE TABLE "approval_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "approval_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"action" "approval_action" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "brand_review_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"result" "brand_guardian_status" NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offending_statements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_correction" text,
	"doctrine_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rule_engine_version" text NOT NULL,
	"ai_enrichment_used" boolean DEFAULT false NOT NULL,
	"ai_usage_record_id" uuid,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"target_audience" text NOT NULL,
	"positioning_angle" text NOT NULL,
	"core_message" text NOT NULL,
	"recommended_channel_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cta" text NOT NULL,
	"destination_concept" text,
	"creative_brief" text,
	"risk_level" "risk_level" DEFAULT 'HIGH' NOT NULL,
	"brand_guardian_status" "brand_guardian_status" DEFAULT 'NOT_REVIEWED' NOT NULL,
	"status" "campaign_status" DEFAULT 'IDEA' NOT NULL,
	"ai_usage_record_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"variant_label" text NOT NULL,
	"angle" text NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"cta" text NOT NULL,
	"image_concept" text NOT NULL,
	"aspect_ratio_suggestions" jsonb DEFAULT '["square","portrait","landscape"]'::jsonb NOT NULL,
	"carousel_concept" text,
	"demo_concept_note" text,
	"rationale" text NOT NULL,
	"brand_guardian_status" "brand_guardian_status" DEFAULT 'NOT_REVIEWED' NOT NULL,
	"ai_usage_record_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"signal_type" "signal_type" NOT NULL,
	"status" "signal_status" DEFAULT 'NEW' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"classification" "classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_signal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"problem" text NOT NULL,
	"target_audience" text NOT NULL,
	"affected_sector" text,
	"geography" text,
	"securepay_relevance" text NOT NULL,
	"money_flow_mapping" "money_flow_mapping" NOT NULL,
	"product_note" text,
	"evidence_summary" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"opportunity_score" integer NOT NULL,
	"urgency" "urgency" DEFAULT 'MEDIUM' NOT NULL,
	"estimated_commercial_potential" text,
	"recommended_marketing_angle" text,
	"recommended_cta" text,
	"risks_caveats" text,
	"status" "opportunity_status" DEFAULT 'DRAFT' NOT NULL,
	"ai_usage_record_id" uuid,
	"classification" "classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"problem_fit" integer NOT NULL,
	"securepay_fit" integer NOT NULL,
	"audience_clarity" integer NOT NULL,
	"commercial_value" integer NOT NULL,
	"reachability" integer NOT NULL,
	"evidence_strength" integer NOT NULL,
	"urgency_timing" integer NOT NULL,
	"total_score" integer NOT NULL,
	"explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_proposed" boolean DEFAULT false NOT NULL,
	"scored_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_signal_id" uuid NOT NULL,
	"source_name" text NOT NULL,
	"source_reference" text,
	"source_type" "evidence_source_type" NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"extracted_claim" text NOT NULL,
	"evidence_snippet" text,
	"confidence" numeric(3, 2) NOT NULL,
	"verification_status" "verification_status" DEFAULT 'NEEDS_REVIEW' NOT NULL,
	"contradictions_notes" text,
	"classification" "classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "is_mock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_reviews" ADD CONSTRAINT "brand_reviews_ai_usage_record_id_ai_usage_records_id_fk" FOREIGN KEY ("ai_usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_reviews" ADD CONSTRAINT "brand_reviews_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ai_usage_record_id_ai_usage_records_id_fk" FOREIGN KEY ("ai_usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_variants" ADD CONSTRAINT "creative_variants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_variants" ADD CONSTRAINT "creative_variants_ai_usage_record_id_ai_usage_records_id_fk" FOREIGN KEY ("ai_usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_variants" ADD CONSTRAINT "creative_variants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_signals" ADD CONSTRAINT "market_signals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_market_signal_id_market_signals_id_fk" FOREIGN KEY ("market_signal_id") REFERENCES "public"."market_signals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_ai_usage_record_id_ai_usage_records_id_fk" FOREIGN KEY ("ai_usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_scored_by_user_id_users_id_fk" FOREIGN KEY ("scored_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_evidence" ADD CONSTRAINT "source_evidence_market_signal_id_market_signals_id_fk" FOREIGN KEY ("market_signal_id") REFERENCES "public"."market_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_evidence" ADD CONSTRAINT "source_evidence_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_scores_opportunity_idx" ON "opportunity_scores" USING btree ("opportunity_id");