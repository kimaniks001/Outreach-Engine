import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { AIGateway } from "@/lib/ai/gateway";
import { markSchemaValid } from "@/lib/ai/usage";
import type { AITaskType } from "@/lib/ai/task-types";

// Shared structured-prompt-contract runner, per the Phase 2 brief Section
// 12: AI output must be structured and validated, and malformed responses
// must be rejected safely rather than trusted. Used by both the market
// intelligence signal analysis task and Brand Guardian's optional AI
// enrichment — see docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md.

export type StructuredTaskResult<T> =
  | {
      status: "SUCCESS";
      data: T;
      provider: string;
      model: string;
      latencyMs: number;
      estimatedCostUsd: number | null;
      usageRecordId: string;
      isMock: boolean;
    }
  | { status: "NO_AVAILABLE_MODEL"; reason: string; usageRecordId: string }
  | { status: "NOT_IMPLEMENTED"; reason: string; usageRecordId: string }
  | { status: "EXECUTION_ERROR"; error: string; usageRecordId: string }
  | { status: "BUDGET_EXCEEDED"; reason: string; usageRecordId: string }
  | { status: "MALFORMED_OUTPUT"; raw: string; error: string; usageRecordId: string };

export async function runStructuredTask<T>(params: {
  taskType: AITaskType;
  system?: string;
  userPrompt: string;
  // Relaxed Input generic: schemas that use `.default()` have an Input type
  // that legitimately differs from their Output type T, which a bare
  // `z.ZodType<T>` (Input defaults to T) would incorrectly reject.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  requestedByUserId: string;
  maxOutputTokens?: number;
}): Promise<StructuredTaskResult<T>> {
  const correlationId = randomUUID();
  const result = await AIGateway.execute({
    taskType: params.taskType,
    correlationId,
    requestedByUserId: params.requestedByUserId,
    prompt: { system: params.system, user: params.userPrompt },
    maxOutputTokens: params.maxOutputTokens,
  });

  if (result.outcome === "NO_AVAILABLE_MODEL") {
    return { status: "NO_AVAILABLE_MODEL", reason: result.reason, usageRecordId: result.usageRecordId };
  }
  if (result.outcome === "NOT_IMPLEMENTED") {
    return { status: "NOT_IMPLEMENTED", reason: result.reason, usageRecordId: result.usageRecordId };
  }
  if (result.outcome === "EXECUTION_ERROR") {
    return { status: "EXECUTION_ERROR", error: result.error, usageRecordId: result.usageRecordId };
  }
  if (result.outcome === "BUDGET_EXCEEDED") {
    return { status: "BUDGET_EXCEEDED", reason: result.reason, usageRecordId: result.usageRecordId };
  }

  // EXECUTED — never trust the raw text; parse and validate before anyone
  // downstream sees it as data.
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(result.rawOutput));
  } catch {
    await markSchemaValid(result.usageRecordId, false);
    return {
      status: "MALFORMED_OUTPUT",
      raw: result.rawOutput,
      error: "Response was not valid JSON.",
      usageRecordId: result.usageRecordId,
    };
  }

  const validated = params.schema.safeParse(parsed);
  if (!validated.success) {
    await markSchemaValid(result.usageRecordId, false);
    return {
      status: "MALFORMED_OUTPUT",
      raw: result.rawOutput,
      error: validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      usageRecordId: result.usageRecordId,
    };
  }

  await markSchemaValid(result.usageRecordId, true);

  return {
    status: "SUCCESS",
    data: validated.data,
    provider: result.selectedProvider.key,
    model: result.selectedModel.modelKey,
    latencyMs: result.latencyMs,
    estimatedCostUsd: result.estimatedCostUsd,
    usageRecordId: result.usageRecordId,
    isMock: result.selectedProvider.isMock,
  };
}

// Real models sometimes wrap JSON in prose or a code fence despite explicit
// instructions not to. Extract the first plausible JSON block defensively
// rather than failing outright on stray formatting.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}
