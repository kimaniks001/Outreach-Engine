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

// Studio/campaign creative generation. A preferred model is only a request to
// the governed AI router; it can never bypass provider availability, per-task
// approval, Safe Mode or AI budgets. If AI cannot execute, the deterministic
// brief fallback remains available and is labelled as such in audit/result.
export async function generateVariantsForCampaign(
  campaignId: string,
  actorUserId: string,
  preferredModelId?: string
) {
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

  const aiResult = await generateCreativeVariantsViaAI({
    campaign: campaignFields,
    requestedByUserId: actorUserId,
    preferredModelId,
  });

  let drafts: CreativeVariantDraft[];
  let aiUsageRecordId: string | null = null;
  let source: "ai" | "deterministic-fallback" = "deterministic-fallback";
  let model: string | null = null;
  let provider: string | null = null;

  if (aiResult.status === "SUCCESS") {
    drafts = aiResult.data.variants.slice(0, MAX_VARIANTS_PER_GENERATION);
    aiUsageRecordId = aiResult.usageRecordId;
    source = "ai";
    model = aiResult.model;
    provider = aiResult.provider;
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
    metadata: {
      source,
      count: inserted.length,
      preferredModelId: preferredModelId ?? null,
      provider,
      model,
    },
  });

  return { variants: inserted, source, provider, model };
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
// with just the campaign name for context, never the full strategy.
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
