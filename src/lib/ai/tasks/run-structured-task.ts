import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { AIGateway } from "@/lib/ai/gateway";
import { markSchemaValid } from "@/lib/ai/usage";
import type { AITaskType } from "@/lib/ai/task-types";

// Shared structured-prompt-contract runner. AI output is never trusted until
// JSON parsing and schema validation succeed.

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
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  requestedByUserId: string;
  preferredModelId?: string;
  maxOutputTokens?: number;
}): Promise<StructuredTaskResult<T>> {
  const correlationId = randomUUID();
  const result = await AIGateway.execute({
    taskType: params.taskType,
    correlationId,
    requestedByUserId: params.requestedByUserId,
    preferredModelId: params.preferredModelId,
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

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}
