CREATE TYPE "public"."audience_segment_status" AS ENUM('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."budget_approval_status" AS ENUM('PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('GOOGLE_SEARCH', 'GOOGLE_DISPLAY', 'YOUTUBE', 'META_FACEBOOK', 'META_INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'X', 'DIRECT_BUSINESS_OUTREACH', 'EMAIL', 'WHATSAPP', 'IN_APP', 'PARTNER_PLATFORM');--> statement-breakpoint
CREATE TYPE "public"."distribution_execution_status" AS ENUM('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."distribution_plan_status" AS ENUM('DRAFT', 'NEEDS_REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."execution_mode" AS ENUM('PLAN_ONLY', 'SIMULATED', 'SANDBOX', 'LIVE');--> statement-breakpoint
ALTER TYPE "public"."approval_subject" ADD VALUE 'audience_segment';--> statement-breakpoint
ALTER TYPE "public"."approval_subject" ADD VALUE 'distribution_plan';--> statement-breakpoint
CREATE TABLE "audience_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience_segment_id" uuid NOT NULL,
	"problem_fit" integer NOT NULL,
	"product_fit" integer NOT NULL,
	"intent" integer NOT NULL,
	"reachability" integer NOT NULL,
	"commercial_value" integer NOT NULL,
	"evidence_strength" integer NOT NULL,
	"channel_fit" integer,
	"total_score" integer NOT NULL,
	"explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_proposed" boolean DEFAULT false NOT NULL,
	"scored_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"linked_campaign_id" uuid NOT NULL,
	"sector" text,
	"geography" text,
	"business_criteria" text,
	"role_function_criteria" text,
	"company_criteria" text,
	"intent_criteria" text,
	"channel_eligibility" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_reach" text,
	"status" "audience_segment_status" DEFAULT 'DRAFT' NOT NULL,
	"classification" "classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"distribution_plan_id" uuid NOT NULL,
	"planned_budget" numeric(12, 2) NOT NULL,
	"approved_budget" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"daily_cap" numeric(12, 2),
	"total_cap" numeric(12, 2),
	"status" "budget_approval_status" DEFAULT 'PROPOSED' NOT NULL,
	"provider_account_reference" text,
	"proposed_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"audience_segment_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"priority" integer NOT NULL,
	"rationale" text NOT NULL,
	"expected_funnel_role" text NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"execution_availability" text NOT NULL,
	"rule_engine_version" text NOT NULL,
	"ai_enrichment_used" boolean DEFAULT false NOT NULL,
	"ai_usage_record_id" uuid,
	"generated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distribution_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"distribution_plan_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"adapter_key" text NOT NULL,
	"mode" "execution_mode" NOT NULL,
	"external_execution_id" text,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"status" "distribution_execution_status" DEFAULT 'PENDING' NOT NULL,
	"error_code" text,
	"normalized_error" text,
	"approved_budget" numeric(12, 2),
	"reported_spend" numeric(12, 2),
	"spend_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_simulated" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distribution_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"audience_segment_id" uuid NOT NULL,
	"objective" text NOT NULL,
	"channel" "channel_type" NOT NULL,
	"channel_strategy" text NOT NULL,
	"creative_variant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"destination" text,
	"cta" text NOT NULL,
	"planned_budget" numeric(12, 2),
	"budget_currency" text DEFAULT 'USD' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"execution_mode" "execution_mode" DEFAULT 'PLAN_ONLY' NOT NULL,
	"risk_level" "risk_level" DEFAULT 'HIGH' NOT NULL,
	"provider_account_reference" text,
	"status" "distribution_plan_status" DEFAULT 'DRAFT' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audience_scores" ADD CONSTRAINT "audience_scores_audience_segment_id_audience_segments_id_fk" FOREIGN KEY ("audience_segment_id") REFERENCES "public"."audience_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_scores" ADD CONSTRAINT "audience_scores_scored_by_user_id_users_id_fk" FOREIGN KEY ("scored_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_linked_campaign_id_campaigns_id_fk" FOREIGN KEY ("linked_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approvals" ADD CONSTRAINT "budget_approvals_distribution_plan_id_distribution_plans_id_fk" FOREIGN KEY ("distribution_plan_id") REFERENCES "public"."distribution_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approvals" ADD CONSTRAINT "budget_approvals_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approvals" ADD CONSTRAINT "budget_approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_recommendations" ADD CONSTRAINT "channel_recommendations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_recommendations" ADD CONSTRAINT "channel_recommendations_audience_segment_id_audience_segments_id_fk" FOREIGN KEY ("audience_segment_id") REFERENCES "public"."audience_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_recommendations" ADD CONSTRAINT "channel_recommendations_ai_usage_record_id_ai_usage_records_id_fk" FOREIGN KEY ("ai_usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_recommendations" ADD CONSTRAINT "channel_recommendations_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_executions" ADD CONSTRAINT "distribution_executions_distribution_plan_id_distribution_plans_id_fk" FOREIGN KEY ("distribution_plan_id") REFERENCES "public"."distribution_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_executions" ADD CONSTRAINT "distribution_executions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_plans" ADD CONSTRAINT "distribution_plans_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_plans" ADD CONSTRAINT "distribution_plans_audience_segment_id_audience_segments_id_fk" FOREIGN KEY ("audience_segment_id") REFERENCES "public"."audience_segments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_plans" ADD CONSTRAINT "distribution_plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audience_scores_segment_idx" ON "audience_scores" USING btree ("audience_segment_id");