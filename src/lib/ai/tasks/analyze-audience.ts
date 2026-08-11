import { z } from "zod";
import { runStructuredTask, type StructuredTaskResult } from "./run-structured-task";
import { computeTotalScore, type ScoreComponents } from "@/lib/audience/scoring";
import { CHANNEL_TYPES } from "@/lib/distribution/channels";

// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 9 — structured prompt
// contract for the AUDIENCE_CLASSIFICATION task. Mirrors
// src/lib/ai/tasks/analyze-signal.ts's shape exactly.

const scoreProposalSchema = z.object({
  problemFit: z.number().min(0).max(100),
  productFit: z.number().min(0).max(100),
  intent: z.number().min(0).max(100),
  reachability: z.number().min(0).max(100),
  commercialValue: z.number().min(0).max(100),
  evidenceStrength: z.number().min(0).max(100),
});

const audienceAnalysisSchema = z.object({
  sector: z.string().default(""),
  geography: z.string().default(""),
  businessCriteria: z.string().default(""),
  roleFunctionCriteria: z.string().default(""),
  companyCriteria: z.string().default(""),
  intentCriteria: z.string().default(""),
  suggestedChannels: z.array(z.enum(CHANNEL_TYPES)).default([]),
  scoreProposal: scoreProposalSchema,
  exclusions: z.string().default(""),
  caveats: z.string().default(""),
});

export type AudienceAnalysis = z.infer<typeof audienceAnalysisSchema>;

export interface AnalyzeAudienceInput {
  campaign: { name: string; objective: string; targetAudience: string; positioningAngle: string };
  segment: { name: string; description: string };
  requestedByUserId: string;
}

export interface AudienceClassification {
  raw: AudienceAnalysis;
  scoreComponents: ScoreComponents;
  totalScore: number;
  explanation: Record<string, string>;
  provider: string;
  model: string;
  isMock: boolean;
  usageRecordId: string;
  estimatedCostUsd: number | null;
  latencyMs: number;
}

const SYSTEM_PROMPT = `You are the audience targeting analyst for the SecurePay Outreach Engine.

Target commercial situations and intent ONLY — business use case, commercial problem, sector, role/function, company type/size, geography, search/commercial intent, and reachable channel.

You must NEVER reference or infer: religion, ethnicity, race, health conditions, sexual orientation, gender identity, political beliefs, immigration status, or any other sensitive personal trait. If the campaign or segment description hints at any of these, ignore that hint entirely and respond only with commercially-relevant criteria — do not carry a sensitive trait into any field, including exclusions or caveats.

SecurePay's core positioning (must be honored): "Money should follow the agreement." / "SecurePay is the agreement layer for money." Never describe SecurePay as a wallet, a bank, an M-PESA competitor, an ordinary payment app, or an escrow product.

Valid channel values for suggestedChannels: ${CHANNEL_TYPES.join(", ")}.

Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "sector": string,
  "geography": string,
  "businessCriteria": string,
  "roleFunctionCriteria": string,
  "companyCriteria": string,
  "intentCriteria": string,
  "suggestedChannels": string[],
  "scoreProposal": { "problemFit": number, "productFit": number, "intent": number, "reachability": number, "commercialValue": number, "evidenceStrength": number },
  "exclusions": string,
  "caveats": string
}
Each score in scoreProposal is 0-100. evidenceStrength should stay conservative (below 50) when no real market evidence was supplied to you.`;

function buildUserPrompt(input: AnalyzeAudienceInput): string {
  return `CAMPAIGN_NAME: ${input.campaign.name}
CAMPAIGN_OBJECTIVE: ${input.campaign.objective}
CAMPAIGN_TARGET_AUDIENCE: ${input.campaign.targetAudience}
CAMPAIGN_POSITIONING_ANGLE: ${input.campaign.positioningAngle}
SEGMENT_NAME: ${input.segment.name}
SEGMENT_DESCRIPTION: ${input.segment.description}

Propose audience targeting criteria for this segment per the JSON contract in the system prompt.`;
}

export async function classifyAudience(
  input: AnalyzeAudienceInput
): Promise<StructuredTaskResult<AudienceClassification>> {
  const result = await runStructuredTask({
    taskType: "AUDIENCE_CLASSIFICATION",
    system: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input),
    schema: audienceAnalysisSchema,
    requestedByUserId: input.requestedByUserId,
    maxOutputTokens: 1024,
  });

  if (result.status !== "SUCCESS") return result;

  const scoreComponents: ScoreComponents = { ...result.data.scoreProposal };
  const totalScore = computeTotalScore(scoreComponents);
  const explanation: Record<string, string> = {
    intentCriteria: result.data.intentCriteria || "No intent criteria proposed.",
    evidenceStrength: "AI-proposed — no per-audience evidence store exists in Phase 3; treat as a starting estimate, not a verified figure.",
  };
  if (result.data.caveats) explanation.caveats = result.data.caveats;
  if (result.data.exclusions) explanation.exclusions = result.data.exclusions;

  return {
    ...result,
    data: {
      raw: result.data,
      scoreComponents,
      totalScore,
      explanation,
      provider: result.provider,
      model: result.model,
      isMock: result.isMock,
      usageRecordId: result.usageRecordId,
      estimatedCostUsd: result.estimatedCostUsd,
      latencyMs: result.latencyMs,
    },
  };
}
