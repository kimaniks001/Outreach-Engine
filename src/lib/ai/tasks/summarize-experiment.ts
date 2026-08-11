import { z } from "zod";
import { runStructuredTask } from "./run-structured-task";

// Optional AI summary for experiment evaluation — Phase 5 brief Section 12:
// "AI may summarize experiment findings but cannot rewrite underlying
// numbers." The deterministic evaluation
// (src/lib/experiments/evaluation.ts) has already computed sample counts,
// conversion rates, differences, confidence, and winner — this task can
// only add one short plain-language summary sentence. It never sees or
// touches the numbers directly; it is handed a pre-formatted description
// and returns prose, which is appended to `interpretation`, never used to
// replace the deterministic values.

const summarySchema = z.object({
  narrative: z.string().min(1).max(400),
});

const SYSTEM_PROMPT = `You are the Experiment summary assistant for the SecurePay Outreach Engine. A deterministic evaluation engine has already computed every number (sample counts, conversion rates, confidence, winner). Your only job is to add one short, plain-language sentence summarizing the finding for a human reviewer. You cannot state a different winner, confidence level, or number than what is given to you. Never invent statistical significance claims beyond the given confidence level. Respond with ONLY JSON: { "narrative": string }.`;

export interface ExperimentSummaryOutcome {
  narrative: string | null;
  aiEnrichmentUsed: boolean;
  aiUsageRecordId: string | null;
}

export async function summarizeExperiment(params: {
  hypothesis: string;
  deterministicResult: string;
  requestedByUserId: string;
}): Promise<ExperimentSummaryOutcome> {
  const result = await runStructuredTask({
    taskType: "IMPACT_ANALYSIS",
    system: SYSTEM_PROMPT,
    userPrompt: `HYPOTHESIS: ${params.hypothesis}\nDETERMINISTIC_RESULT: ${params.deterministicResult}\n\nWrite one short plain-language summary sentence for a human reviewer.`,
    schema: summarySchema,
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
