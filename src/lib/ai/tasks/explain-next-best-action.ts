import { z } from "zod";
import { runStructuredTask } from "./run-structured-task";

// Optional AI narrative enrichment for the Next-Best-Action engine —
// Phase 4 brief Section 19. The deterministic rule engine
// (src/lib/next-best-action/engine.ts) has already decided the action,
// priority, eligible channels, and every eligibility/suppression check.
// This task can only add one short, compliant sentence of plain-language
// explanation or messaging-idea text — it can never override suppression,
// override consent, infer a sensitive trait, invent product eligibility,
// or bypass a lifecycle rule. Same authority pattern as Channel
// Recommendation's optional AI enrichment (src/lib/ai/tasks/recommend-channels.ts).
// Activates the AI_TASK_TYPES "IMPACT_ANALYSIS" category, declared but
// unused since Phase 1.

const enrichmentSchema = z.object({
  narrative: z.string().min(1).max(400),
});

const SYSTEM_PROMPT = `You are the Next-Best-Action narrative assistant for the SecurePay Outreach Engine. A deterministic rule engine has already decided the recommended action, priority, and eligible channels — your only job is to add one short, plain-language sentence explaining the recommendation to a human reviewer or suggesting compliant messaging phrasing. You cannot change the action, priority, channels, or any eligibility/suppression decision. Never infer a private relationship, emotional state, or personal situation (e.g. do not say "send this to your girlfriend" — use neutral language like "someone you trust" only if directly relevant). Never invent product eligibility or make legal/compliance claims. Respond with ONLY JSON: { "narrative": string }.`;

export interface NextBestActionEnrichmentOutcome {
  narrative: string | null;
  aiNarrativeUsed: boolean;
  aiUsageRecordId: string | null;
}

export async function explainNextBestAction(params: {
  actionType: string;
  reason: string;
  lifecycleState: string;
  requestedByUserId: string;
}): Promise<NextBestActionEnrichmentOutcome> {
  const result = await runStructuredTask({
    taskType: "IMPACT_ANALYSIS",
    system: SYSTEM_PROMPT,
    userPrompt: `ACTION_TYPE: ${params.actionType}\nDETERMINISTIC_REASON: ${params.reason}\nLIFECYCLE_STATE: ${params.lifecycleState}\n\nWrite one short sentence of plain-language context for a human reviewer.`,
    schema: enrichmentSchema,
    requestedByUserId: params.requestedByUserId,
    maxOutputTokens: 200,
  });

  if (result.status === "SUCCESS") {
    return { narrative: result.data.narrative, aiNarrativeUsed: true, aiUsageRecordId: result.usageRecordId };
  }
  if ("usageRecordId" in result) {
    return { narrative: null, aiNarrativeUsed: false, aiUsageRecordId: result.usageRecordId };
  }
  return { narrative: null, aiNarrativeUsed: false, aiUsageRecordId: null };
}
