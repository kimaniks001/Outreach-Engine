CREATE TYPE "public"."budget_period" AS ENUM('DAILY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."budget_policy_scope" AS ENUM('GLOBAL', 'PROVIDER', 'MODEL', 'TASK_TYPE', 'USER');--> statement-breakpoint
CREATE TYPE "public"."evidence_confidence" AS ENUM('INSUFFICIENT_DATA', 'LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('DRAFT', 'PLANNED', 'RUNNING', 'COMPLETED', 'INCONCLUSIVE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."growth_recommendation_action_type" AS ENUM('INVESTIGATE_OPPORTUNITY', 'CREATE_CAMPAIGN', 'REVISE_POSITIONING', 'SHIFT_CHANNEL_PRIORITY', 'PAUSE_LOW_VALUE_PLAN', 'INCREASE_BUDGET_REQUEST', 'REDUCE_BUDGET_REQUEST', 'RUN_EXPERIMENT', 'IMPROVE_ONBOARDING', 'RECOVER_JOURNEY', 'UPSELL_SEGMENT', 'REENGAGE_SEGMENT', 'REVIEW_MODEL', 'REDUCE_AI_COST', 'NO_ACTION');--> statement-breakpoint
CREATE TYPE "public"."growth_recommendation_status" AS ENUM('PROPOSED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'ACTIONED', 'EXPIRED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."learning_status" AS ENUM('ACTIVE', 'NEEDS_REVIEW', 'SUPERSEDED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."model_recommendation_status" AS ENUM('PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."retention_action" AS ENUM('REVIEWED', 'ANONYMIZED', 'PURGE_BLOCKED_LEGAL_HOLD');--> statement-breakpoint
CREATE TABLE "ai_budget_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "budget_policy_scope" NOT NULL,
	"scope_ref" text,
	"period_type" "budget_period" NOT NULL,
	"soft_limit_usd" numeric(10, 2),
	"hard_limit_usd" numeric(10, 2),
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_experiment_id" uuid,
	"source_campaign_id" uuid,
	"source_opportunity_id" uuid,
	"observation" text NOT NULL,
	"conclusion" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" "evidence_confidence" NOT NULL,
	"applicable_audience_segment_id" uuid,
	"applicable_sector" text,
	"applicable_channel" "channel_type",
	"applicable_product" text,
	"learned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_after" timestamp with time zone,
	"status" "learning_status" DEFAULT 'ACTIVE' NOT NULL,
	"superseded_by_learning_id" uuid,
	"classification" "classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"per_variant" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"winner_variant_id" uuid,
	"confidence" "evidence_confidence" NOT NULL,
	"interpretation" text NOT NULL,
	"evaluation_engine_version" text NOT NULL,
	"ai_enrichment_used" boolean DEFAULT false NOT NULL,
	"ai_usage_record_id" uuid,
	"generated_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "experiment_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"variant_label" text NOT NULL,
	"is_control" boolean DEFAULT false NOT NULL,
	"messaging_angle" text NOT NULL,
	"creative_variant_id" uuid,
	"cta" text NOT NULL,
	"distribution_plan_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text NOT NULL,
	"campaign_id" uuid,
	"opportunity_id" uuid,
	"audience_segment_id" uuid,
	"channel" "channel_type",
	"primary_metric_type" "conversion_type",
	"primary_metric" text NOT NULL,
	"secondary_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_outcome" text NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" "experiment_status" DEFAULT 'DRAFT' NOT NULL,
	"result" text,
	"interpretation" text,
	"confidence" "evidence_confidence" DEFAULT 'INSUFFICIENT_DATA' NOT NULL,
	"winner_variant_id" uuid,
	"classification" "classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"action_type" "growth_recommendation_action_type" NOT NULL,
	"priority" "urgency" DEFAULT 'MEDIUM' NOT NULL,
	"expected_impact" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"supporting_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"affected_pillars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"campaign_id" uuid,
	"audience_segment_id" uuid,
	"organization_id" uuid,
	"experiment_id" uuid,
	"learning_id" uuid,
	"product_reference" text,
	"reason" text NOT NULL,
	"confidence" "evidence_confidence" NOT NULL,
	"risk_level" "risk_level" DEFAULT 'LOW' NOT NULL,
	"cost_implication" text,
	"human_approval_required" boolean DEFAULT true NOT NULL,
	"status" "growth_recommendation_status" DEFAULT 'PROPOSED' NOT NULL,
	"generated_by" text DEFAULT 'deterministic-engine' NOT NULL,
	"ai_enrichment_used" boolean DEFAULT false NOT NULL,
	"ai_usage_record_id" uuid,
	"ranking_score" numeric(6, 2),
	"ranking_explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_reference_type" text,
	"action_reference_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"classification" "classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"task_type" text NOT NULL,
	"sample_count" integer NOT NULL,
	"success_rate" numeric(5, 4) NOT NULL,
	"schema_valid_rate" numeric(5, 4),
	"human_acceptance_rate" numeric(5, 4),
	"revision_rate" numeric(5, 4),
	"avg_latency_ms" numeric(10, 2),
	"avg_cost_usd" numeric(10, 5),
	"fallback_rate" numeric(5, 4) NOT NULL,
	"evaluation_window_start" timestamp with time zone NOT NULL,
	"evaluation_window_end" timestamp with time zone NOT NULL,
	"confidence" "evidence_confidence" NOT NULL,
	"is_benchmark" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type" text NOT NULL,
	"from_provider_id" uuid,
	"from_model_id" uuid,
	"to_provider_id" uuid NOT NULL,
	"to_model_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"supporting_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "model_recommendation_status" DEFAULT 'PROPOSED' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "retention_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"action" "retention_action" NOT NULL,
	"reason" text NOT NULL,
	"performed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD COLUMN "schema_valid" boolean;--> statement-breakpoint
ALTER TABLE "ai_budget_policies" ADD CONSTRAINT "ai_budget_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_learnings" ADD CONSTRAINT "commercial_learnings_source_experiment_id_experiments_id_fk" FOREIGN KEY ("source_experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_learnings" ADD CONSTRAINT "commercial_learnings_source_campaign_id_campaigns_id_fk" FOREIGN KEY ("source_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_learnings" ADD CONSTRAINT "commercial_learnings_source_opportunity_id_opportunities_id_fk" FOREIGN KEY ("source_opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_learnings" ADD CONSTRAINT "commercial_learnings_applicable_audience_segment_id_audience_segments_id_fk" FOREIGN KEY ("applicable_audience_segment_id") REFERENCES "public"."audience_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_learnings" ADD CONSTRAINT "commercial_learnings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_ai_usage_record_id_ai_usage_records_id_fk" FOREIGN KEY ("ai_usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_creative_variant_id_creative_variants_id_fk" FOREIGN KEY ("creative_variant_id") REFERENCES "public"."creative_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_distribution_plan_id_distribution_plans_id_fk" FOREIGN KEY ("distribution_plan_id") REFERENCES "public"."distribution_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_audience_segment_id_audience_segments_id_fk" FOREIGN KEY ("audience_segment_id") REFERENCES "public"."audience_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_audience_segment_id_audience_segments_id_fk" FOREIGN KEY ("audience_segment_id") REFERENCES "public"."audience_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_learning_id_commercial_learnings_id_fk" FOREIGN KEY ("learning_id") REFERENCES "public"."commercial_learnings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_ai_usage_record_id_ai_usage_records_id_fk" FOREIGN KEY ("ai_usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_recommendations" ADD CONSTRAINT "growth_recommendations_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_performance" ADD CONSTRAINT "model_performance_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_performance" ADD CONSTRAINT "model_performance_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_recommendations" ADD CONSTRAINT "model_recommendations_from_provider_id_ai_providers_id_fk" FOREIGN KEY ("from_provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_recommendations" ADD CONSTRAINT "model_recommendations_from_model_id_ai_models_id_fk" FOREIGN KEY ("from_model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_recommendations" ADD CONSTRAINT "model_recommendations_to_provider_id_ai_providers_id_fk" FOREIGN KEY ("to_provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_recommendations" ADD CONSTRAINT "model_recommendations_to_model_id_ai_models_id_fk" FOREIGN KEY ("to_model_id") REFERENCES "public"."ai_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_recommendations" ADD CONSTRAINT "model_recommendations_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_actions" ADD CONSTRAINT "retention_actions_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_actions" ADD CONSTRAINT "retention_actions_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;