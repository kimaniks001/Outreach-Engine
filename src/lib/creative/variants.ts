import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { runBrandGuardian } from "@/lib/brand-guardian";
import {
  generateCreativeVariantsViaAI,
  buildDeterministicVariants,
  type CreativeVariantDraft,
} from "@/lib/ai/tasks/generate-creative";
import { getCampaign } from "@/lib/campaigns/campaigns";

const MAX_VARIANTS_PER_GENERATION = 3;

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Sections 16-18. Tries AI
// first; always falls back to a deterministic template set so Creative
// Studio never simply fails for lack of AI — max 3 variants either way.
export async function generateVariantsForCampaign(campaignId: string, actorUserId: string) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const campaignFields = {
    name: campaign.name,
    objective: campaign.objective,
    targetAudience: campaign.targetAudience,
    positioningAngle: campaign.positioningAngle,
    coreMessage: campaign.coreMessage,
    cta: campaign.cta,
  };

  const aiResult = await generateCreativeVariantsViaAI({ campaign: campaignFields, requestedByUserId: actorUserId });

  let drafts: CreativeVariantDraft[];
  let aiUsageRecordId: string | null = null;
  let source: "ai" | "deterministic-fallback" = "deterministic-fallback";

  if (aiResult.status === "SUCCESS") {
    drafts = aiResult.data.variants.slice(0, MAX_VARIANTS_PER_GENERATION);
    aiUsageRecordId = aiResult.usageRecordId;
    source = "ai";
  } else {
    drafts = buildDeterministicVariants(campaignFields);
    if ("usageRecordId" in aiResult) aiUsageRecordId = aiResult.usageRecordId;
  }

  const inserted = [];
  for (const draft of drafts.slice(0, MAX_VARIANTS_PER_GENERATION)) {
    const [row] = await db
      .insert(schema.creativeVariants)
      .values({
        campaignId,
        variantLabel: draft.variantLabel,
        angle: draft.angle,
        headline: draft.headline,
        body: draft.body,
        cta: draft.cta,
        imageConcept: draft.imageConcept,
        rationale: draft.rationale,
        aiUsageRecordId,
        createdByUserId: actorUserId,
      })
      .returning();
    inserted.push(row!);
  }

  await recordAuditEvent({
    eventType: "CREATIVE_GENERATED",
    actorUserId,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { source, count: inserted.length },
  });

  return { variants: inserted, source };
}

export async function listVariantsForCampaign(campaignId: string) {
  return db
    .select()
    .from(schema.creativeVariants)
    .where(eq(schema.creativeVariants.campaignId, campaignId))
    .orderBy(schema.creativeVariants.variantLabel);
}

export async function getVariant(id: string) {
  const rows = await db.select().from(schema.creativeVariants).where(eq(schema.creativeVariants.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function runVariantBrandGuardian(variantId: string, actorUserId: string) {
  const variant = await getVariant(variantId);
  if (!variant) throw new Error("Creative variant not found");

  const outcome = await runBrandGuardian({
    fields: { headline: variant.headline, body: variant.body, cta: variant.cta },
    requestedByUserId: actorUserId,
  });

  await db.insert(schema.brandReviews).values({
    subjectType: "creative_variant",
    subjectId: variantId,
    result: outcome.result,
    reasons: outcome.reasons,
    offendingStatements: outcome.offendingStatements,
    recommendedCorrection: outcome.recommendedCorrection,
    doctrineReferences: outcome.doctrineReferences,
    ruleEngineVersion: outcome.ruleEngineVersion,
    aiEnrichmentUsed: outcome.aiEnrichmentUsed,
    aiUsageRecordId: outcome.aiUsageRecordId,
    requestedByUserId: actorUserId,
  });

  await db
    .update(schema.creativeVariants)
    .set({ brandGuardianStatus: outcome.result, updatedAt: new Date() })
    .where(eq(schema.creativeVariants.id, variantId));

  return outcome;
}

export async function listVariantsForCampaigns(campaignIds: string[]) {
  if (campaignIds.length === 0) return [];
  const rows = await db.select().from(schema.creativeVariants).orderBy(desc(schema.creativeVariants.createdAt));
  return rows.filter((r) => campaignIds.includes(r.campaignId));
}

// Content & Engagement's view into campaign work — creative variants only,
// with just the campaign *name* for context, never the full strategy
// (opportunity link, positioning angle, objective). See
// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md RBAC section.
export async function listAllVariantsWithCampaignName() {
  const rows = await db
    .select({
      variant: schema.creativeVariants,
      campaignName: schema.campaigns.name,
      campaignStatus: schema.campaigns.status,
    })
    .from(schema.creativeVariants)
    .innerJoin(schema.campaigns, eq(schema.creativeVariants.campaignId, schema.campaigns.id))
    .orderBy(desc(schema.creativeVariants.createdAt));
  return rows;
}
