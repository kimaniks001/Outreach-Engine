import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { rankRecommendedChannels, CHANNEL_RULE_ENGINE_VERSION } from "./channel-recommendation";
import { executionAvailabilityFor } from "./providers";
import { enrichChannelRecommendations } from "@/lib/ai/tasks/recommend-channels";

// Orchestrates the deterministic Channel Recommendation Engine → optional AI
// narrative enrichment → persistence, following
// src/lib/campaigns/campaigns.ts::runCampaignBrandGuardian's shape. The
// rule-engine ranking is always authoritative; AI enrichment can only append
// one shared narrative sentence to every generated row's rationale — it
// cannot change the channel list, priority, or scores.
export async function generateChannelRecommendations(
  campaignId: string,
  audienceSegmentId: string,
  actorUserId: string
) {
  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId)).limit(1);
  if (!campaign) throw new Error("Campaign not found");

  const [segment] = await db
    .select()
    .from(schema.audienceSegments)
    .where(eq(schema.audienceSegments.id, audienceSegmentId))
    .limit(1);
  if (!segment) throw new Error("Audience segment not found");

  const ranked = rankRecommendedChannels({
    campaignObjective: campaign.objective,
    audienceSegment: {
      sector: segment.sector,
      geography: segment.geography,
      intentCriteria: segment.intentCriteria,
      roleFunctionCriteria: segment.roleFunctionCriteria,
      companyCriteria: segment.companyCriteria,
      businessCriteria: segment.businessCriteria,
      channelEligibility: segment.channelEligibility,
    },
  });

  const enrichment = await enrichChannelRecommendations({
    campaignObjective: campaign.objective,
    topChannels: ranked,
    requestedByUserId: actorUserId,
  });

  const inserted = [];
  for (const rec of ranked) {
    const rationale = enrichment.narrative ? `${rec.reasons.join(" ")} ${enrichment.narrative}` : rec.reasons.join(" ");
    const [row] = await db
      .insert(schema.channelRecommendations)
      .values({
        campaignId,
        audienceSegmentId,
        channel: rec.channel,
        priority: rec.priority,
        rationale,
        expectedFunnelRole: rec.expectedFunnelRole,
        risks: rec.risks,
        requiredAssets: rec.requiredAssets,
        executionAvailability: executionAvailabilityFor(rec.channel),
        ruleEngineVersion: CHANNEL_RULE_ENGINE_VERSION,
        aiEnrichmentUsed: enrichment.aiEnrichmentUsed,
        aiUsageRecordId: enrichment.aiUsageRecordId,
        generatedByUserId: actorUserId,
      })
      .returning();
    inserted.push(row!);
  }

  await recordAuditEvent({
    eventType: "CHANNEL_RECOMMENDATION_GENERATED",
    actorUserId,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { audienceSegmentId, count: inserted.length, aiEnrichmentUsed: enrichment.aiEnrichmentUsed },
  });

  return inserted;
}

export async function listChannelRecommendations(campaignId: string, audienceSegmentId?: string) {
  const rows = await db
    .select()
    .from(schema.channelRecommendations)
    .where(eq(schema.channelRecommendations.campaignId, campaignId))
    .orderBy(desc(schema.channelRecommendations.createdAt));
  return audienceSegmentId ? rows.filter((r) => r.audienceSegmentId === audienceSegmentId) : rows;
}

export async function listAllChannelRecommendations() {
  return db.select().from(schema.channelRecommendations).orderBy(desc(schema.channelRecommendations.createdAt));
}
