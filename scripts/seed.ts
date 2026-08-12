// Run via `npm run db:seed`, which passes --env-file=.env.local to Node so
// DATABASE_URL is set before any module (like src/lib/db) reads it at
// import time.
import { randomBytes } from "node:crypto";
import { db, schema } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { ROLES, type Role } from "../src/lib/rbac/roles";
import { eq, desc, sql, and } from "drizzle-orm";
import { createAudienceSegment, reviewAudienceSegment } from "../src/lib/audience/segments";
import { computeTotalScore } from "../src/lib/audience/scoring";
import {
  createDistributionPlan,
  updateDistributionPlan,
  runDistributionPlanBrandGuardian,
  reviewDistributionPlan,
  markDistributionPlanReady,
} from "../src/lib/distribution/plans";
import { proposeBudget, approveBudget } from "../src/lib/distribution/budget-guard";
import { DistributionGateway } from "../src/lib/distribution/gateway";
import { resolveProfile } from "../src/lib/commercial-memory/identity";
import { recordTouchpoint } from "../src/lib/commercial-memory/touchpoints";
import { getCurrentNextBestAction } from "../src/lib/next-best-action/engine";
import { simulateProductEvent, simulateElapsedTime } from "../src/lib/product-events/simulator";
import { createExperiment, addVariant, planExperiment, startExperiment } from "../src/lib/experiments/experiments";
import { evaluateAndPersist } from "../src/lib/experiments/evaluation";
import { createLearningFromExperiment } from "../src/lib/learning/learnings";
import { generateAndPersistRecommendations } from "../src/lib/growth-director/engine";
import { seedProvidersAndModels } from "./seed-providers";

// Local development seed only. Never run against a shared or production
// database — see the Phase 1 brief Section 9 and docs/DATA_CLASSIFICATION.md
// (credentials are RESTRICTED and must never be committed or reused).
//
// Production readiness review: this script creates 6 predictable
// @dev.local accounts and unconditionally seeds demo scenarios — it must
// never run against a production database. It refuses to run when
// NODE_ENV=production. Production's first Owner account must be created
// via `npm run db:bootstrap` (scripts/bootstrap-production.ts) instead —
// see docs/PRODUCTION_READINESS_REVIEW.md and docs/INITIAL_LAUNCH_RUNBOOK.md.
//
// Every non-Owner account gets a random password printed once to the
// console. The Owner account uses SEED_OWNER_PASSWORD if set, otherwise a
// random one too. Nothing is written to a file.

if (process.env.NODE_ENV === "production") {
  console.error(
    "Refusing to run `npm run db:seed` with NODE_ENV=production. This script seeds demo data and predictable @dev.local accounts — it must never touch a production database. Use `npm run db:bootstrap` to create the first production Owner account instead."
  );
  process.exit(1);
}

function randomPassword(): string {
  return randomBytes(12).toString("base64url");
}

const DEV_USERS: Array<{ role: Role; name: string; email: string }> = [
  { role: "OWNER", name: "Dev Owner", email: "owner@dev.local" },
  { role: "GROWTH_DIRECTOR", name: "Dev Growth Director", email: "growth-director@dev.local" },
  { role: "STRATEGIST", name: "Dev Strategist", email: "strategist@dev.local" },
  { role: "CONTENT_ENGAGEMENT", name: "Dev Content & Engagement", email: "content-engagement@dev.local" },
  { role: "DISTRIBUTION_SALES", name: "Dev Distribution / Sales", email: "distribution-sales@dev.local" },
  { role: "ANALYST", name: "Dev Analyst", email: "analyst@dev.local" },
];

async function seedUsers() {
  const credentials: Array<{ email: string; role: Role; password: string }> = [];

  for (const spec of DEV_USERS) {
    const password =
      spec.role === "OWNER" && process.env.SEED_OWNER_PASSWORD
        ? process.env.SEED_OWNER_PASSWORD
        : randomPassword();
    const passwordHash = await hashPassword(password);

    await db
      .insert(schema.users)
      .values({
        email: spec.email,
        name: spec.name,
        role: spec.role,
        passwordHash,
        active: true,
      })
      .onConflictDoUpdate({
        target: schema.users.email,
        set: { passwordHash, name: spec.name, role: spec.role, active: true },
      });

    credentials.push({ email: spec.email, role: spec.role, password });
  }

  return credentials;
}

async function seedSafeMode() {
  await db
    .insert(schema.systemSettings)
    .values({ key: "safe_mode", value: { mode: "NORMAL" } })
    .onConflictDoNothing({ target: schema.systemSettings.key });
}

const DEMO_SIGNAL_TITLE = "Contractors are being paid large deposits before work milestones are completed";

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 29 — ONE clearly
// labeled demo scenario (isDemo: true everywhere), deliberately left with
// zero source evidence so it demonstrates the honest MANUAL/UNVERIFIED path
// rather than presenting itself as real, sourced market intelligence. Log
// in as Owner and walk it through Intelligence → Analyze → Review → Approve
// → Campaigns → Create Campaign → Brand Guardian → Generate Creative →
// Approve to see the full Phase 2 flow end to end.
async function seedDemoScenario(ownerUserId: string) {
  const existing = await db
    .select()
    .from(schema.marketSignals)
    .where(eq(schema.marketSignals.title, DEMO_SIGNAL_TITLE))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(schema.marketSignals).values({
    title: DEMO_SIGNAL_TITLE,
    summary:
      "Homeowners and small businesses report paying 40-50% deposits to contractors before any milestone is delivered, with no protection if work stalls or is abandoned. This is a DEMO/SAMPLE signal for local walkthroughs, not verified current market intelligence.",
    signalType: "MANUAL",
    status: "NEW",
    tags: ["construction", "milestone-payments", "demo"],
    notes: "DEMO scenario per docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 29. Intentionally left without source evidence.",
    classification: "INTERNAL",
    isDemo: true,
    createdByUserId: ownerUserId,
  });
}

const DEMO_AUDIENCE_NAME = "Kenyan contractors & clients with milestone-payment needs";

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 35. Continues the
// Phase 2 demo campaign once it exists (seedDemoScenario only seeds the
// starting signal — a human/Owner walks it through to
// READY_FOR_DISTRIBUTION via the live UI/API, same precedent as Phase 2).
// If that hasn't happened yet, this is skipped gracefully — re-run
// `npm run db:seed` after the Phase 2 walkthrough to pick it up. Every step
// below calls the real service/gateway functions (not raw inserts for the
// plan/budget/execution), so the seeded demo state is produced by the
// actual Phase 3 architecture, not fabricated — see Section 19.
async function seedPhase3DemoScenario(ownerUserId: string) {
  const existingAudience = await db
    .select()
    .from(schema.audienceSegments)
    .where(eq(schema.audienceSegments.name, DEMO_AUDIENCE_NAME))
    .limit(1);
  if (existingAudience.length > 0) return;

  const [demoCampaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.isDemo, true))
    .orderBy(desc(schema.campaigns.createdAt))
    .limit(1);

  if (!demoCampaign || demoCampaign.status !== "READY_FOR_DISTRIBUTION") {
    console.log(
      "\nPhase 3 demo scenario not seeded yet: walk the Phase 2 demo campaign through to READY_FOR_DISTRIBUTION as Owner, then re-run `npm run db:seed`."
    );
    return;
  }

  const segment = await createAudienceSegment(
    {
      name: DEMO_AUDIENCE_NAME,
      description:
        "DEMO/SAMPLE audience for the construction milestone-payment scenario. Contractors, homeowners, and building clients in Kenya managing milestone-based payments.",
      linkedCampaignId: demoCampaign.id,
      sector: "Construction",
      geography: "Kenya",
      businessCriteria: "Businesses and individuals engaging contractors for milestone-based project payments.",
      roleFunctionCriteria: "Contractors, construction project managers, homeowners/building clients.",
      companyCriteria: "Small to mid-size construction/contracting businesses.",
      intentCriteria:
        "Actively managing or paying milestone-based contractor payments; searching for payment-protection solutions.",
      channelEligibility: ["GOOGLE_SEARCH", "META_FACEBOOK", "LINKEDIN", "WHATSAPP"],
      estimatedReach: "Illustrative demo estimate only — not a real market sizing figure.",
    },
    ownerUserId
  );

  // Manually set, not AI-proposed — deliberately conservative on
  // evidenceStrength since no real market evidence backs this demo score,
  // matching the honest MANUAL/UNVERIFIED discipline the Phase 2 demo
  // signal established.
  await db.insert(schema.audienceScores).values({
    audienceSegmentId: segment.id,
    problemFit: 80,
    productFit: 75,
    intent: 78,
    reachability: 65,
    commercialValue: 70,
    evidenceStrength: 30,
    channelFit: 72,
    totalScore: computeTotalScore({
      problemFit: 80,
      productFit: 75,
      intent: 78,
      reachability: 65,
      commercialValue: 70,
      evidenceStrength: 30,
      channelFit: 72,
    }),
    explanation: {
      evidenceStrength: "DEMO/SAMPLE — manually set, deliberately conservative; no real market evidence backs this figure.",
      intentCriteria: "High commercial intent inferred from the milestone-payment problem framing, not measured.",
    },
    aiProposed: false,
    scoredByUserId: ownerUserId,
  });

  await reviewAudienceSegment(segment.id, "APPROVE", ownerUserId, "DEMO — approved for local walkthrough.");

  const plan = await createDistributionPlan(
    {
      campaignId: demoCampaign.id,
      audienceSegmentId: segment.id,
      objective: "Drive qualified interest for milestone-payment protection among contractors and clients in Kenya.",
      channel: "GOOGLE_SEARCH",
      channelStrategy:
        "High-intent Google Search campaign targeting milestone-payment and contractor-payment-protection queries in Kenya. Agree on the milestone. Let the money follow.",
      destination: "SecurePay demo / KeyContract explainer page",
      cta: "See how it works",
      plannedBudget: 50,
      budgetCurrency: "KES",
    },
    ownerUserId
  );

  await updateDistributionPlan(plan.id, { executionMode: "SIMULATED" });
  await proposeBudget(
    { distributionPlanId: plan.id, plannedBudget: 50, currency: "KES", dailyCap: 10, totalCap: 50 },
    ownerUserId
  );
  await approveBudget(plan.id, ownerUserId);
  await runDistributionPlanBrandGuardian(plan.id, ownerUserId);
  await reviewDistributionPlan(plan.id, "APPROVE", ownerUserId, "DEMO — approved for local walkthrough.");
  await markDistributionPlanReady(plan.id, ownerUserId);

  const launchOutcome = await DistributionGateway.launch(plan.id, ownerUserId);
  if (launchOutcome.outcome !== "LAUNCHED") {
    console.log(`\nPhase 3 demo: plan created but simulated launch did not complete (${launchOutcome.outcome}).`);
  }
}

const DEMO_LEAD_CLICK_REF = "demo-construction-lead-001";

// docs/PHASE_4_AUDIENCE_MEMORY_ATTRIBUTION_CONVERSION.md Section 32 — the
// exact numbered construction demo journey, continuing the Phase 2/3
// construction demo campaign. Every step calls the real
// commercial-memory/product-event/journey/attribution/next-best-action
// architecture (identity resolution, touchpoint recording, the
// deterministic product-event simulator) — nothing here is a raw insert.
// isDemo: true and source "demo_seed"/"simulator" everywhere, so this is
// never confusable with real activity. Idempotent: skipped if the demo
// profile already exists.
async function seedPhase4DemoScenario(ownerUserId: string) {
  const [demoCampaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.isDemo, true))
    .orderBy(desc(schema.campaigns.createdAt))
    .limit(1);

  if (!demoCampaign) {
    console.log("\nPhase 4 demo scenario not seeded yet: no demo campaign found — walk the Phase 2 demo first.");
    return;
  }

  const existingIdentifier = await db
    .select({ id: schema.profileIdentifiers.id })
    .from(schema.profileIdentifiers)
    .where(eq(schema.profileIdentifiers.identifierValue, DEMO_LEAD_CLICK_REF))
    .limit(1);
  if (existingIdentifier.length > 0) return;

  // 1. Person sees construction campaign; 2. visits landing/demo.
  const profile = await resolveProfile({
    identifiers: { campaignClickRef: DEMO_LEAD_CLICK_REF },
    source: "demo_seed",
    isDemo: true,
  });

  // A known reachable channel is required before any outreach-shaped
  // next-best-action is eligible (data minimization — see
  // src/lib/next-best-action/engine.ts's guardedDecision). This lead came
  // through Google Search, so that is its one known eligible channel.
  await db
    .update(schema.audienceProfiles)
    .set({ eligibleChannels: ["GOOGLE_SEARCH"] })
    .where(eq(schema.audienceProfiles.id, profile.id));

  await recordTouchpoint({
    profileId: profile.id,
    campaignId: demoCampaign.id,
    channel: "GOOGLE_SEARCH",
    type: "AD_IMPRESSION",
    sourceSystem: "demo_seed",
    isDemo: true,
  });
  await recordTouchpoint({
    profileId: profile.id,
    campaignId: demoCampaign.id,
    channel: "GOOGLE_SEARCH",
    type: "LANDING_PAGE_VIEW",
    sourceSystem: "demo_seed",
    isDemo: true,
  });

  // 3. Creates KSNumber — SIMULATED product event (no live SecurePay call).
  // Carries the new KSNumber reference so identity resolution upgrades the
  // profile from ANONYMOUS to KSNUMBER (src/lib/commercial-memory/identity.ts).
  await simulateProductEvent({
    productEventType: "KSNUMBER_CREATED",
    profileRef: { campaignClickRef: DEMO_LEAD_CLICK_REF, ksNumber: "KS-DEMO-0001" },
    campaignId: demoCampaign.id,
    metadata: { demo: true },
  });

  // 4. Starts SecureLink (draft).
  await simulateProductEvent({
    productEventType: "SECURELINK_DRAFT_STARTED",
    profileRef: { campaignClickRef: DEMO_LEAD_CLICK_REF },
    campaignId: demoCampaign.id,
    metadata: { draftRef: "demo-securelink-draft-1" },
  });

  // 5-7. Stops before completion; system detects the incomplete journey
  // once past its threshold (simulated elapsed time, not a real wait);
  // Next-Best-Action becomes RESUME_JOURNEY.
  await simulateElapsedTime(25);

  const canonicalProfile = await resolveProfile({
    identifiers: { campaignClickRef: DEMO_LEAD_CLICK_REF },
    source: "demo_seed",
    isDemo: true,
  });
  const nbaAfterAbandonment = await getCurrentNextBestAction(canonicalProfile.id);
  if (nbaAfterAbandonment?.actionType !== "RESUME_JOURNEY") {
    console.log(
      `\nPhase 4 demo: expected RESUME_JOURNEY after simulated abandonment, got ${nbaAfterAbandonment?.actionType ?? "none"}.`
    );
  }

  // 8. SecureLink eventually created.
  await simulateProductEvent({
    productEventType: "SECURELINK_CREATED",
    profileRef: { campaignClickRef: DEMO_LEAD_CLICK_REF },
    campaignId: demoCampaign.id,
  });

  // 9. Agreement completed.
  await simulateProductEvent({
    productEventType: "AGREEMENT_COMPLETED",
    profileRef: { campaignClickRef: DEMO_LEAD_CLICK_REF },
    campaignId: demoCampaign.id,
  });

  // 10. Lifecycle moves FIRST_USE (verified, not asserted, by reading the
  // profile back after the AGREEMENT_COMPLETED event above).
  const afterFirstUse = await db
    .select({ lifecycleState: schema.audienceProfiles.lifecycleState })
    .from(schema.audienceProfiles)
    .where(eq(schema.audienceProfiles.id, canonicalProfile.id))
    .limit(1);
  if (afterFirstUse[0]?.lifecycleState !== "FIRST_USE") {
    console.log(`\nPhase 4 demo: expected FIRST_USE lifecycle, got ${afterFirstUse[0]?.lifecycleState}.`);
  }

  // 11. Repeat product use later moves lifecycle to ACTIVE.
  await simulateProductEvent({
    productEventType: "PRODUCT_REUSED",
    profileRef: { campaignClickRef: DEMO_LEAD_CLICK_REF },
    campaignId: demoCampaign.id,
  });

  const afterRepeatUse = await db
    .select({ lifecycleState: schema.audienceProfiles.lifecycleState })
    .from(schema.audienceProfiles)
    .where(eq(schema.audienceProfiles.id, canonicalProfile.id))
    .limit(1);

  console.log(
    `\nPhase 4 demo scenario seeded: profile ${canonicalProfile.id} walked REACHED → ENGAGED → REGISTERED → (abandoned SecureLink draft) → RESUME_JOURNEY → FIRST_USE → ${
      afterRepeatUse[0]?.lifecycleState ?? "?"
    }. Log in as Owner and open Audiences → Profiles to see it.`
  );
}

const PHASE5_EXPERIMENT_NAME = "Milestone framing vs generic safety framing";

// docs/PHASE_5_IMPACT_GROWTH_DIRECTOR_SCALE.md Section 45 — the exact
// numbered scenario: two campaign/creative variants with genuinely
// different outcomes, a weak-activation cohort and a zero-conversion
// "pause" plan (real funnel drop-off + real low-value-plan evidence), an
// experiment that records a winner + a learning, and Growth Director
// recommendations that trace back to all of it. Every step calls the real
// service layer (createDistributionPlan, resolveProfile, recordTouchpoint,
// simulateProductEvent, createExperiment/evaluateAndPersist,
// createLearningFromExperiment, generateAndPersistRecommendations, and the
// real Phase 3 budget/Brand-Guardian/launch pipeline for the pause-
// candidate plan) — nothing here is a raw insert.
async function seedPhase5DemoScenario(ownerUserId: string) {
  const existingExperiment = await db.select().from(schema.experiments).where(eq(schema.experiments.name, PHASE5_EXPERIMENT_NAME)).limit(1);
  if (existingExperiment.length > 0) return;

  const [demoCampaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.isDemo, true)).orderBy(desc(schema.campaigns.createdAt)).limit(1);
  if (!demoCampaign) {
    console.log("\nPhase 5 demo scenario not seeded yet: no demo campaign found — walk the Phase 2 demo first.");
    return;
  }

  const [demoSegment] = await db
    .select()
    .from(schema.audienceSegments)
    .where(and(eq(schema.audienceSegments.linkedCampaignId, demoCampaign.id), eq(schema.audienceSegments.status, "APPROVED")))
    .limit(1);
  if (!demoSegment) {
    console.log("\nPhase 5 demo scenario not seeded yet: no APPROVED demo audience segment found — the Phase 3 demo seeds this automatically once the campaign is READY_FOR_DISTRIBUTION.");
    return;
  }

  const campaign = demoCampaign;
  const segment = demoSegment;

  async function demoPlan(channel: (typeof schema.channelTypeEnum.enumValues)[number], objective: string, channelStrategy: string, cta: string) {
    const plan = await createDistributionPlan(
      { campaignId: campaign.id, audienceSegmentId: segment.id, objective, channel, channelStrategy, cta },
      ownerUserId
    );
    return plan;
  }

  const planA = await demoPlan("GOOGLE_SEARCH", "Variant A: milestone-control framing", "Agree on the milestone. Let the money follow.", "See how it works");
  const planB = await demoPlan("META_FACEBOOK", "Variant B: generic payment-safety framing", "Protect your payments from start to finish.", "Learn more");
  const planWeak = await demoPlan("WHATSAPP", "Weak-activation channel — registers but rarely activates", "Milestone payment protection, now on WhatsApp.", "Get started");
  const planPause = await demoPlan("X", "Low-value channel — reach with no measurable conversion", "Milestone payment protection.", "Learn more");

  // Experiment created and started BEFORE the synthetic leads below, so
  // every conversion's occurredAt falls inside [startDate, now] — the
  // deterministic evaluation window (src/lib/experiments/evaluation.ts).
  const experiment = await createExperiment(
    {
      name: PHASE5_EXPERIMENT_NAME,
      hypothesis: "Construction audiences respond better to milestone-control messaging than generic payment-safety messaging.",
      campaignId: campaign.id,
      audienceSegmentId: segment.id,
      channel: "GOOGLE_SEARCH",
      primaryMetricType: "FIRST_SECURELINK",
      primaryMetric: "First SecureLink creation rate",
      expectedOutcome: "Compare first meaningful SecurePay use (SecureLink creation), not clicks — milestone framing (A) is expected to outperform generic safety framing (B).",
      isDemo: true,
    },
    ownerUserId
  );
  await addVariant({
    experimentId: experiment.id,
    variantLabel: "A",
    isControl: false,
    messagingAngle: "Milestone-control framing",
    cta: "See how it works",
    distributionPlanId: planA.id,
    description: "Agree on the milestone. Let the money follow.",
  });
  await addVariant({
    experimentId: experiment.id,
    variantLabel: "B",
    isControl: true,
    messagingAngle: "Generic payment-safety framing",
    cta: "Learn more",
    distributionPlanId: planB.id,
    description: "Protect your payments from start to finish.",
  });
  await planExperiment(experiment.id);
  await startExperiment(experiment.id, ownerUserId);

  async function seedLead(opts: {
    planId: string;
    channel: (typeof schema.channelTypeEnum.enumValues)[number];
    registers: boolean;
    createsSecureLink: boolean;
    completesAgreement: boolean;
    index: number;
  }) {
    const email = `phase5-demo-${opts.planId.slice(0, 8)}-${opts.index}@example.com`;
    const profile = await resolveProfile({ identifiers: { email }, source: "demo_seed", isDemo: true });
    await db.update(schema.audienceProfiles).set({ eligibleChannels: [opts.channel] }).where(eq(schema.audienceProfiles.id, profile.id));

    await recordTouchpoint({
      profileId: profile.id,
      campaignId: campaign.id,
      distributionPlanId: opts.planId,
      channel: opts.channel,
      type: "AD_IMPRESSION",
      sourceSystem: "demo_seed",
      isDemo: true,
    });
    await recordTouchpoint({
      profileId: profile.id,
      campaignId: campaign.id,
      distributionPlanId: opts.planId,
      channel: opts.channel,
      type: "LANDING_PAGE_VIEW",
      sourceSystem: "demo_seed",
      isDemo: true,
    });

    if (opts.registers) {
      await simulateProductEvent({ productEventType: "KSNUMBER_CREATED", profileRef: { email }, campaignId: campaign.id });
      if (opts.createsSecureLink) {
        await simulateProductEvent({ productEventType: "SECURELINK_CREATED", profileRef: { email }, campaignId: campaign.id });
        if (opts.completesAgreement) {
          await simulateProductEvent({ productEventType: "AGREEMENT_COMPLETED", profileRef: { email }, campaignId: campaign.id });
        }
      }
    }
  }

  // Variant A: 25 reached, 22 register, 11 create a SecureLink (5 also
  // complete an agreement) — a strong, real ~44% activation rate.
  for (let i = 0; i < 25; i++) {
    await seedLead({ planId: planA.id, channel: "GOOGLE_SEARCH", registers: i < 22, createsSecureLink: i < 11, completesAgreement: i < 5, index: i });
  }
  // Variant B: 25 reached, 22 register, only 4 create a SecureLink — a
  // real ~16% activation rate, meaningfully worse than A.
  for (let i = 0; i < 25; i++) {
    await seedLead({ planId: planB.id, channel: "META_FACEBOOK", registers: i < 22, createsSecureLink: i < 4, completesAgreement: false, index: i });
  }
  // Weak-activation cohort: everyone registers, nobody activates — a real
  // KSNUMBER → PRODUCT_CREATED funnel drop at the campaign level.
  for (let i = 0; i < 15; i++) {
    await seedLead({ planId: planWeak.id, channel: "WHATSAPP", registers: true, createsSecureLink: false, completesAgreement: false, index: i });
  }
  // Pause-candidate cohort: reach with zero registrations/conversions.
  for (let i = 0; i < 12; i++) {
    await seedLead({ planId: planPause.id, channel: "X", registers: false, createsSecureLink: false, completesAgreement: false, index: i });
  }

  // Real measured spend on the zero-conversion plan, via the same real
  // Phase 3 pipeline the plan-A0 demo already uses (Brand Guardian →
  // budget → READY → launch) — not a raw insert. PAUSE_LOW_VALUE_PLAN
  // (src/lib/growth-director/candidates.ts) only considers RUNNING plans,
  // since pausing a plan that was never live is meaningless.
  await updateDistributionPlan(planPause.id, { executionMode: "SIMULATED" });
  await proposeBudget({ distributionPlanId: planPause.id, plannedBudget: 200, currency: "KES", dailyCap: 50, totalCap: 200 }, ownerUserId);
  await approveBudget(planPause.id, ownerUserId);
  await runDistributionPlanBrandGuardian(planPause.id, ownerUserId);
  await reviewDistributionPlan(planPause.id, "APPROVE", ownerUserId, "DEMO — approved for local walkthrough.");
  await markDistributionPlanReady(planPause.id, ownerUserId);
  const pauseLaunch = await DistributionGateway.launch(planPause.id, ownerUserId);
  if (pauseLaunch.outcome === "LAUNCHED") {
    await DistributionGateway.refreshExecutionStatus(pauseLaunch.executionId);
  } else {
    console.log(`\nPhase 5 demo: pause-candidate plan did not launch (${pauseLaunch.outcome}) — PAUSE_LOW_VALUE_PLAN evidence will be incomplete.`);
  }

  const evaluation = await evaluateAndPersist(experiment.id, { useAiNarrative: true, requestedByUserId: ownerUserId, generatedByUserId: ownerUserId });
  if (evaluation.status !== "COMPLETED") {
    console.log(`\nPhase 5 demo: expected the experiment to COMPLETE with a winner, got ${evaluation.status}.`);
  }

  await createLearningFromExperiment(experiment.id, ownerUserId);

  const recommendations = await generateAndPersistRecommendations({
    useAiNarrative: true,
    requestedByUserId: ownerUserId,
    generatedByUserId: ownerUserId,
    includeDemo: true,
  });
  const actionTypes = new Set(recommendations.map((r) => r.actionType));
  if (!actionTypes.has("INCREASE_BUDGET_REQUEST")) {
    console.log("\nPhase 5 demo: expected an INCREASE_BUDGET_REQUEST recommendation (scale the winning variant) but none was generated.");
  }
  if (!actionTypes.has("PAUSE_LOW_VALUE_PLAN")) {
    console.log("\nPhase 5 demo: expected a PAUSE_LOW_VALUE_PLAN recommendation (limit the weak channel) but none was generated.");
  }

  console.log(
    `\nPhase 5 demo scenario seeded: experiment "${PHASE5_EXPERIMENT_NAME}" completed (${evaluation.status}); ${recommendations.length} Growth Director recommendations generated (${[...actionTypes].join(", ")}). Log in as Owner and open Growth Director → "What should SecurePay do next?".`
  );
}

async function main() {
  console.log("Seeding Outreach Engine development data...\n");

  await db.execute(sql`select 1`); // fail fast with a clear error if DB is unreachable

  const credentials = await seedUsers();
  await seedProvidersAndModels();
  await seedSafeMode();

  const [owner] = await db.select().from(schema.users).where(eq(schema.users.email, "owner@dev.local")).limit(1);
  if (owner) await seedDemoScenario(owner.id);
  if (owner) await seedPhase3DemoScenario(owner.id);
  if (owner) await seedPhase4DemoScenario(owner.id);
  if (owner) await seedPhase5DemoScenario(owner.id);

  console.log("Development accounts created (passwords shown once, not stored anywhere):\n");
  for (const cred of credentials) {
    console.log(`  ${cred.role.padEnd(20)} ${cred.email.padEnd(32)} ${cred.password}`);
  }
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? "\nAnthropic: ANTHROPIC_API_KEY detected — provider should show AVAILABLE."
      : "\nAnthropic: ANTHROPIC_API_KEY not set — provider will show NOT_CONFIGURED (this is expected and the app remains fully usable via the mock provider)."
  );
  console.log("Mock / Test Provider: always available, needs no credentials — see Admin → AI Providers.");
  console.log("Safe Mode initialized to NORMAL.");
  console.log(
    `\nDemo scenario seeded: "${DEMO_SIGNAL_TITLE}" (isDemo=true, unverified) — log in as Owner and open Intelligence → Signals to walk it through.`
  );
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
