import { z } from "zod";
import { runStructuredTask } from "./run-structured-task";
import type { RankedChannelRecommendation } from "@/lib/distribution/channel-recommendation";
import { CHANNEL_LABELS } from "@/lib/distribution/channels";

// Optional AI narrative enrichment for the Channel Recommendation Engine —
// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 11/34. The
// deterministic rule engine (src/lib/distribution/channel-recommendation.ts)
// has already produced the ranked channel list; this task can only add one
// short sentence of narrative context per top channel. It can never add,
// remove, or reorder a channel — same authority pattern as Brand Guardian's
// optional AI enrichment (src/lib/brand-guardian/index.ts).

const enrichmentSchema = z.object({
  narrative: z.string().min(1),
});

const ENRICHMENT_SYSTEM_PROMPT = `You are the Channel Recommendation narrative assistant for the SecurePay Outreach Engine. A deterministic rule engine has already ranked channels — your only job is to add one short, plain-language sentence of strategic context for a human reviewer, referencing the top-ranked channels by name. You cannot add, remove, or reorder any channel. Never invent budget figures, platform policies, or legal/compliance claims. Respond with ONLY JSON: { "narrative": string }.`;

export interface ChannelEnrichmentOutcome {
  narrative: string | null;
  aiEnrichmentUsed: boolean;
  aiUsageRecordId: string | null;
}

export async function enrichChannelRecommendations(params: {
  campaignObjective: string;
  topChannels: RankedChannelRecommendation[];
  requestedByUserId: string;
}): Promise<ChannelEnrichmentOutcome> {
  const summary = params.topChannels
    .slice(0, 5)
    .map((c) => `- ${CHANNEL_LABELS[c.channel]} (priority ${c.priority}, score ${c.score}): ${c.reasons.join(" ")}`)
    .join("\n");

  const result = await runStructuredTask({
    taskType: "CHANNEL_RECOMMENDATION",
    system: ENRICHMENT_SYSTEM_PROMPT,
    userPrompt: `CAMPAIGN_OBJECTIVE: ${params.campaignObjective}\nRANKED_CHANNELS:\n${summary}\n\nWrite one short sentence of strategic context for a human reviewer.`,
    schema: enrichmentSchema,
    requestedByUserId: params.requestedByUserId,
    maxOutputTokens: 200,
  });

  if (result.status === "SUCCESS") {
    return { narrative: result.data.narrative, aiEnrichmentUsed: true, aiUsageRecordId: result.usageRecordId };
  }
  if ("usageRecordId" in result) {
    return { narrative: null, aiEnrichmentUsed: false, aiUsageRecordId: result.usageRecordId };
  }
  return { narrative: null, aiEnrichmentUsed: false, aiUsageRecordId: null };
}
