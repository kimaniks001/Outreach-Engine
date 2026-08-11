import { z } from "zod";
import { runStructuredTask } from "./run-structured-task";

// Optional AI synthesis for Growth Director recommendations — Phase 5
// brief Sections 20-21. Activates the AI_TASK_TYPES "GROWTH_RECOMMENDATION"
// category, declared but unused since Phase 1. The deterministic
// candidate/ranking engine (src/lib/growth-director/{candidates,ranking}.ts)
// has already decided every recommendation, its priority, risk, and score
// — this task can only attach one short explanatory sentence per
// recommendation, addressed strictly by an id the caller supplied. It
// cannot add a new recommendation, change an action type, or alter any
// score/evidence field — the caller re-validates every returned id against
// the exact set it sent before writing anything (see
// src/lib/growth-director/engine.ts).

const noteSchema = z.object({
  recommendationId: z.string().uuid(),
  narrative: z.string().min(1).max(400),
});
const synthesisSchema = z.object({
  notes: z.array(noteSchema).max(10),
});

const SYSTEM_PROMPT = `You are the Growth Director narrative assistant for the SecurePay Outreach Engine. A deterministic engine has already generated and ranked every recommendation with its own evidence — your only job is to add one short, plain-language explanatory sentence per recommendation, addressed by the exact "id" field given to you. You must never invent a new recommendation id, never state a different action, priority, or metric than what is given, and never make legal/compliance/pricing claims. Respond with ONLY JSON: { "notes": [{ "recommendationId": string, "narrative": string }] }.`;

export interface GrowthSynthesisInput {
  id: string;
  title: string;
  actionType: string;
  reason: string;
  priority: string;
  confidence: string;
}

export interface GrowthSynthesisOutcome {
  notesByRecommendationId: Map<string, string>;
  aiEnrichmentUsed: boolean;
  aiUsageRecordId: string | null;
}

export async function synthesizeGrowthRecommendations(params: {
  candidates: GrowthSynthesisInput[];
  requestedByUserId: string;
}): Promise<GrowthSynthesisOutcome> {
  const prompt = params.candidates
    .map((c) => JSON.stringify({ id: c.id, title: c.title, actionType: c.actionType, reason: c.reason, priority: c.priority, confidence: c.confidence }))
    .join("\n");

  const result = await runStructuredTask({
    taskType: "GROWTH_RECOMMENDATION",
    system: SYSTEM_PROMPT,
    userPrompt: `RANKED_RECOMMENDATIONS (one JSON object per line):\n${prompt}\n\nWrite one short explanatory sentence per recommendation, keyed by its exact id.`,
    schema: synthesisSchema,
    requestedByUserId: params.requestedByUserId,
    maxOutputTokens: 800,
  });

  if (result.status === "SUCCESS") {
    const knownIds = new Set(params.candidates.map((c) => c.id));
    const notesByRecommendationId = new Map<string, string>();
    for (const note of result.data.notes) {
      if (knownIds.has(note.recommendationId)) {
        notesByRecommendationId.set(note.recommendationId, note.narrative);
      }
      // Silently drop any id AI invented that wasn't in the known set —
      // never trust AI-supplied ids blindly.
    }
    return { notesByRecommendationId, aiEnrichmentUsed: notesByRecommendationId.size > 0, aiUsageRecordId: result.usageRecordId };
  }
  if ("usageRecordId" in result) {
    return { notesByRecommendationId: new Map(), aiEnrichmentUsed: false, aiUsageRecordId: result.usageRecordId };
  }
  return { notesByRecommendationId: new Map(), aiEnrichmentUsed: false, aiUsageRecordId: null };
}
