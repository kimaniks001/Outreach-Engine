CREATE TYPE "public"."attribution_model" AS ENUM('FIRST_TOUCH', 'LAST_TOUCH', 'LINEAR', 'MULTI_TOUCH');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('GRANTED', 'DENIED', 'WITHDRAWN', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."conversion_type" AS ENUM('VISIT', 'ENGAGEMENT', 'KSNUMBER_CREATED', 'FIRST_SECURELINK', 'FIRST_KEYCONTRACT', 'FIRST_GROUP_SECURELINK', 'FIRST_SECUREFLOW', 'PAYMENT_COMMITTED', 'AGREEMENT_COMPLETED', 'SETTLEMENT_COMPLETED', 'REPEAT_USE', 'REFERRAL');--> statement-breakpoint
CREATE TYPE "public"."identifier_type" AS ENUM('SESSION_TOKEN', 'CAMPAIGN_CLICK_REF', 'EMAIL_REF', 'PHONE_REF', 'KSNUMBER', 'ORGANIZATION_REF', 'PARTNER_REF');--> statement-breakpoint
CREATE TYPE "public"."journey_status" AS ENUM('STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."journey_type" AS ENUM('KSNUMBER_REGISTRATION', 'SECURELINK_CREATION', 'KEYCONTRACT_CREATION', 'GROUP_SECURELINK_CREATION', 'SECUREFLOW_CREATION', 'BUSINESS_ONBOARDING', 'DEMO', 'API_INTEGRATION');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_state" AS ENUM('UNKNOWN', 'REACHED', 'ENGAGED', 'INTERESTED', 'REGISTERED', 'FIRST_USE', 'ACTIVE', 'HIGH_VALUE', 'DORMANT', 'SUPPRESSED');--> statement-breakpoint
CREATE TYPE "public"."nba_action_type" AS ENUM('EDUCATE', 'RESUME_JOURNEY', 'COMPLETE_ONBOARDING', 'CREATE_FIRST_PRODUCT', 'REPEAT_USE', 'UPSELL', 'CROSS_SELL', 'REQUEST_DEMO', 'BUSINESS_CONTACT', 'NO_ACTION', 'SUPPRESS');--> statement-breakpoint
CREATE TYPE "public"."org_relationship_status" AS ENUM('PROSPECT', 'ENGAGED', 'CUSTOMER', 'CHURNED');--> statement-breakpoint
CREATE TYPE "public"."product_event_status" AS ENUM('RECEIVED', 'PROCESSED', 'DUPLICATE', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."product_event_type" AS ENUM('KSNUMBER_CREATED', 'SECURELINK_DRAFT_STARTED', 'SECURELINK_CREATED', 'KEYCONTRACT_CREATED', 'GROUP_SECURELINK_CREATED', 'SECUREFLOW_CREATED', 'PAYMENT_COMMITTED', 'AGREEMENT_COMPLETED', 'SETTLEMENT_COMPLETED', 'PRODUCT_REUSED');--> statement-breakpoint
CREATE TYPE "public"."profile_link_action" AS ENUM('MERGE', 'UNLINK');--> statement-breakpoint
CREATE TYPE "public"."profile_type" AS ENUM('ANONYMOUS', 'PERSON', 'BUSINESS', 'KSNUMBER', 'PARTNER');--> statement-breakpoint
CREATE TYPE "public"."retargeting_eligibility_status" AS ENUM('ELIGIBLE', 'NOT_ELIGIBLE', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."suppression_action" AS ENUM('APPLIED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('OPT_OUT', 'DO_NOT_CONTACT', 'POLICY_BLOCK', 'COMPLIANCE_RULE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."touchpoint_type" AS ENUM('AD_IMPRESSION', 'AD_CLICK', 'LANDING_PAGE_VIEW', 'DEMO_STARTED', 'DEMO_COMPLETED', 'FORM_SUBMITTED', 'OUTREACH_PLANNED', 'OUTREACH_SENT', 'REPLY_RECEIVED', 'KSNUMBER_CREATED', 'SECURELINK_STARTED', 'SECURELINK_CREATED', 'KEYCONTRACT_CREATED', 'GROUP_SECURELINK_CREATED', 'SECUREFLOW_CREATED', 'PAYMENT_COMMITTED', 'AGREEMENT_COMPLETED', 'SETTLEMENT_COMPLETED', 'REFERRAL_CREATED', 'PRODUCT_REUSED');--> statement-breakpoint
CREATE TABLE "attribution_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversion_event_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"campaign_id" uuid,
	"distribution_plan_id" uuid,
	"channel" "channel_type",
	"touchpoint_id" uuid,
	"attribution_model" "attribution_model" NOT NULL,
	"weight" numeric(5, 4) NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_type" "profile_type" DEFAULT 'ANONYMOUS' NOT NULL,
	"display_name" text,
	"organization_id" uuid,
	"ks_number_ref" text,
	"email_ref" text,
	"phone_ref" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifecycle_state" "lifecycle_state" DEFAULT 'UNKNOWN' NOT NULL,
	"eligible_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"classification" "classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"merged_into_profile_id" uuid,
	"retention_class" text DEFAULT 'standard' NOT NULL,
	"retention_until" timestamp with time zone,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"channel" "channel_type",
	"status" "consent_status" NOT NULL,
	"legal_basis" text,
	"source" text NOT NULL,
	"recorded_by_user_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"organization_id" uuid,
	"conversion_type" "conversion_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source_product_event_id" uuid,
	"value" numeric(12, 2),
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "next_best_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"action_type" "nba_action_type" NOT NULL,
	"reason" text NOT NULL,
	"priority" "urgency" DEFAULT 'MEDIUM' NOT NULL,
	"eligible_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_product" text,
	"cta" text,
	"triggering_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"blocked_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suppression_state" text NOT NULL,
	"rule_engine_version" text NOT NULL,
	"ai_narrative_used" boolean DEFAULT false NOT NULL,
	"ai_usage_record_id" uuid,
	"generated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"sector" text,
	"geography" text,
	"website" text,
	"business_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relationship_status" "org_relationship_status" DEFAULT 'PROSPECT' NOT NULL,
	"use_cases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lifecycle_state" "lifecycle_state" DEFAULT 'UNKNOWN' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_event_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"product_event_type" "product_event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_version" text DEFAULT '1' NOT NULL,
	"profile_id" uuid,
	"organization_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "product_event_status" DEFAULT 'RECEIVED' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"journey_type" "journey_type" NOT NULL,
	"current_step" text NOT NULL,
	"status" "journey_status" DEFAULT 'STARTED' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"origin_campaign_id" uuid,
	"origin_touchpoint_id" uuid,
	"product_reference" text,
	"resume_reference" text,
	"abandonment_reason" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"identifier_type" "identifier_type" NOT NULL,
	"identifier_value" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_profile_id" uuid NOT NULL,
	"to_profile_id" uuid NOT NULL,
	"action" "profile_link_action" NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retargeting_eligibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"campaign_id" uuid,
	"channel" "channel_type",
	"eligibility" "retargeting_eligibility_status" NOT NULL,
	"reason" text NOT NULL,
	"checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"action" "suppression_action" NOT NULL,
	"reason" "suppression_reason",
	"source" text NOT NULL,
	"actor_user_id" uuid,
	"review_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "touchpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"organization_id" uuid,
	"campaign_id" uuid,
	"distribution_plan_id" uuid,
	"execution_id" uuid,
	"channel" "channel_type",
	"type" "touchpoint_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_system" text DEFAULT 'outreach_engine' NOT NULL,
	"external_ref" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"classification" "classification" DEFAULT 'INTERNAL' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attribution_records" ADD CONSTRAINT "attribution_records_conversion_event_id_conversion_events_id_fk" FOREIGN KEY ("conversion_event_id") REFERENCES "public"."conversion_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_records" ADD CONSTRAINT "attribution_records_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_records" ADD CONSTRAINT "attribution_records_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_records" ADD CONSTRAINT "attribution_records_distribution_plan_id_distribution_plans_id_fk" FOREIGN KEY ("distribution_plan_id") REFERENCES "public"."distribution_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_records" ADD CONSTRAINT "attribution_records_touchpoint_id_touchpoints_id_fk" FOREIGN KEY ("touchpoint_id") REFERENCES "public"."touchpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_profiles" ADD CONSTRAINT "audience_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_profiles" ADD CONSTRAINT "audience_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_source_product_event_id_product_events_id_fk" FOREIGN KEY ("source_product_event_id") REFERENCES "public"."product_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_best_actions" ADD CONSTRAINT "next_best_actions_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_best_actions" ADD CONSTRAINT "next_best_actions_ai_usage_record_id_ai_usage_records_id_fk" FOREIGN KEY ("ai_usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_best_actions" ADD CONSTRAINT "next_best_actions_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_journeys" ADD CONSTRAINT "product_journeys_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_journeys" ADD CONSTRAINT "product_journeys_origin_campaign_id_campaigns_id_fk" FOREIGN KEY ("origin_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_journeys" ADD CONSTRAINT "product_journeys_origin_touchpoint_id_touchpoints_id_fk" FOREIGN KEY ("origin_touchpoint_id") REFERENCES "public"."touchpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_identifiers" ADD CONSTRAINT "profile_identifiers_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_links" ADD CONSTRAINT "profile_links_from_profile_id_audience_profiles_id_fk" FOREIGN KEY ("from_profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_links" ADD CONSTRAINT "profile_links_to_profile_id_audience_profiles_id_fk" FOREIGN KEY ("to_profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_links" ADD CONSTRAINT "profile_links_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retargeting_eligibility" ADD CONSTRAINT "retargeting_eligibility_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retargeting_eligibility" ADD CONSTRAINT "retargeting_eligibility_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retargeting_eligibility" ADD CONSTRAINT "retargeting_eligibility_evaluated_by_user_id_users_id_fk" FOREIGN KEY ("evaluated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_records" ADD CONSTRAINT "suppression_records_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_records" ADD CONSTRAINT "suppression_records_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_profile_id_audience_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_distribution_plan_id_distribution_plans_id_fk" FOREIGN KEY ("distribution_plan_id") REFERENCES "public"."distribution_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_execution_id_distribution_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."distribution_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_events_source_idempotency_idx" ON "product_events" USING btree ("source","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_identifiers_type_value_idx" ON "profile_identifiers" USING btree ("identifier_type","identifier_value");