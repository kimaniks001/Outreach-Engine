import { z } from "zod";
import { runStructuredTask, type StructuredTaskResult } from "./run-structured-task";
import { MONEY_FLOW_DEFINITIONS, resolveMoneyFlowMapping } from "@/lib/opportunity/money-flow";
import {
  computeTotalScore,
  deriveEvidenceStrengthScore,
  type EvidenceForScoring,
  type ScoreComponents,
} from "@/lib/opportunity/scoring";

// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 12 — structured
// prompt contract for the market intelligence AI task. Activates the
// existing OPPORTUNITY_CLASSIFICATION task type from Phase 1.

const scoreProposalSchema = z.object({
  problemFit: z.number().min(0).max(100),
  securepayFit: z.number().min(0).max(100),
  audienceClarity: z.number().min(0).max(100),
  commercialValue: z.number().min(0).max(100),
  reachability: z.number().min(0).max(100),
  urgencyTiming: z.number().min(0).max(100),
});

const opportunityAnalysisSchema = z.object({
  problem: z.string().min(1),
  targetAudience: z.string().min(1),
  sector: z.string().default(""),
  geography: z.string().default(""),
  securepayRelevance: z.string().min(1),
  moneyFlowMapping: z.string().min(1),
  productNote: z.string().default(""),
  opportunityScoreProposal: scoreProposalSchema,
  evidenceReasoning: z.string().min(1),
  caveats: z.string().default(""),
  recommendedNextStep: z.string().default(""),
});

export type OpportunityAnalysis = z.infer<typeof opportunityAnalysisSchema>;

export interface AnalyzeSignalInput {
  signal: { title: string; summary: string; signalType: string };
  evidence: Array<EvidenceForScoring & { sourceName: string; extractedClaim: string }>;
  requestedByUserId: string;
}

export interface AnalyzedOpportunity {
  raw: OpportunityAnalysis;
  moneyFlowMapping: ReturnType<typeof resolveMoneyFlowMapping>;
  scoreComponents: ScoreComponents;
  totalScore: number;
  provider: string;
  model: string;
  isMock: boolean;
  usageRecordId: string;
  estimatedCostUsd: number | null;
  latencyMs: number;
}

const SYSTEM_PROMPT = `You are the market intelligence analyst for the SecurePay Outreach Engine.

SecurePay's core positioning (must be honored exactly, never override it):
"Money should follow the agreement." / "SecurePay is the agreement layer for money."
SecurePay must NEVER be described as a wallet, a bank, an M-PESA competitor, an ordinary payment app, or an escrow product.

The ONLY SecurePay money-flow concepts you may map an opportunity to are:
${Object.values(MONEY_FLOW_DEFINITIONS)
  .map((d) => `- ${d.key} (${d.label}): ${d.product} — ${d.description}`)
  .join("\n")}

If the signal does not give you enough information to confidently choose one of the four money-flow types above, respond with moneyFlowMapping: "NEEDS_DOCTRINE_REVIEW". Do not invent a SecurePay product, feature, price, or legal/regulatory claim that was not given to you.

Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "problem": string,
  "targetAudience": string,
  "sector": string,
  "geography": string,
  "securepayRelevance": string,
  "moneyFlowMapping": "ONE_TO_ONE" | "MANY_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_MANY" | "NEEDS_DOCTRINE_REVIEW",
  "productNote": string,
  "opportunityScoreProposal": { "problemFit": number, "securepayFit": number, "audienceClarity": number, "commercialValue": number, "reachability": number, "urgencyTiming": number },
  "evidenceReasoning": string,
  "caveats": string,
  "recommendedNextStep": string
}
Each score in opportunityScoreProposal is 0-100 and must be justified by evidenceReasoning. Do not fabricate certainty the evidence does not support.`;

function buildUserPrompt(input: AnalyzeSignalInput): string {
  const evidenceBlock =
    input.evidence.length > 0
      ? input.evidence
          .map(
            (e, i) =>
              `EVIDENCE_${i + 1}: source="${e.sourceName}" verification=${e.verificationStatus} confidence=${e.confidence} claim="${e.extractedClaim}"`
          )
          .join("\n")
      : "EVIDENCE: none — this signal is MANUAL/UNVERIFIED. Reflect this honestly in evidenceReasoning and keep confidence-dependent language cautious.";

  return `SIGNAL_TITLE: ${input.signal.title}
SIGNAL_SUMMARY: ${input.signal.summary}
SIGNAL_TYPE: ${input.signal.signalType}
${evidenceBlock}

Analyze this market signal for SecurePay per the JSON contract in the system prompt.`;
}

export async function analyzeSignal(
  input: AnalyzeSignalInput
): Promise<StructuredTaskResult<AnalyzedOpportunity>> {
  const result = await runStructuredTask({
    taskType: "OPPORTUNITY_CLASSIFICATION",
    system: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input),
    schema: opportunityAnalysisSchema,
    requestedByUserId: input.requestedByUserId,
    maxOutputTokens: 1024,
  });

  if (result.status !== "SUCCESS") return result;

  const moneyFlowMapping = resolveMoneyFlowMapping(result.data.moneyFlowMapping);
  const evidenceStrength = deriveEvidenceStrengthScore(input.evidence);
  const scoreComponents: ScoreComponents = {
    ...result.data.opportunityScoreProposal,
    evidenceStrength,
  };
  const totalScore = computeTotalScore(scoreComponents);

  return {
    ...result,
    data: {
      raw: result.data,
      moneyFlowMapping,
      scoreComponents,
      totalScore,
      provider: result.provider,
      model: result.model,
      isMock: result.isMock,
      usageRecordId: result.usageRecordId,
      estimatedCostUsd: result.estimatedCostUsd,
      latencyMs: result.latencyMs,
    },
  };
}
