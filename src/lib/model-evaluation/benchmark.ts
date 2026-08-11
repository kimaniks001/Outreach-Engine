import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/log";
import { runStructuredTask } from "@/lib/ai/tasks/run-structured-task";
import type { AITaskType } from "@/lib/ai/task-types";

// Small, SecurePay-specific benchmark suite — Phase 5 brief Sections
// 26-27. Deliberately NOT a multi-model bake-off: every call goes through
// the normal AI Gateway → Model Router path (ADR-002 — application/
// benchmark code never selects a provider/model directly), so a benchmark
// run exercises exactly whatever the router currently selects for each
// task type. This is a fresh, on-demand, manually-initiated snapshot of
// "does the currently-approved pipeline work end-to-end," not a
// side-by-side comparison — that comparison is what
// src/lib/model-evaluation/recommendations.ts already does from organic
// usage history. Never calls a distribution provider, never publishes
// anything, respects Safe Mode and AI budget caps (both enforced inside
// AIGateway.execute()) automatically.

// A loose schema — the benchmark measures whether the model returns valid,
// parseable, non-empty structured JSON for a realistic SecurePay prompt,
// not deep field-level grading (Section 26: "do not build a massive
// evaluation framework").
const permissiveSchema = z.record(z.unknown()).refine((obj) => Object.keys(obj).length > 0, {
  message: "Response must be a non-empty JSON object.",
});

interface BenchmarkFixture {
  taskType: AITaskType;
  label: string;
  system: string;
  userPrompt: string;
}

const FIXTURES: BenchmarkFixture[] = [
  {
    taskType: "OPPORTUNITY_CLASSIFICATION",
    label: "Opportunity classification",
    system: "Classify the commercial opportunity below. Respond with ONLY a JSON object.",
    userPrompt: "SIGNAL_TITLE: Contractors are being paid large deposits before work milestones are completed\nSIGNAL_SUMMARY: Homeowners report paying 40-50% deposits with no protection if work stalls.",
  },
  {
    taskType: "SOURCE_SYNTHESIS",
    label: "Source synthesis",
    system: "Synthesize the following sources into a short structured summary. Respond with ONLY a JSON object.",
    userPrompt: "SOURCE_1: Industry report on milestone payment disputes in construction.\nSOURCE_2: Customer feedback describing abandoned projects after upfront deposits.",
  },
  {
    taskType: "BRAND_REVIEW",
    label: "Brand Guardian narrative assistance",
    system: "Provide one short narrative sentence of context for a human reviewer. Respond with ONLY a JSON object.",
    userPrompt: "DETERMINISTIC_RESULT: PASS. No prohibited positioning found.",
  },
  {
    taskType: "CAMPAIGN_STRATEGY",
    label: "Campaign strategy",
    system: "Propose a campaign strategy angle. Respond with ONLY a JSON object.",
    userPrompt: "OPPORTUNITY: Milestone-payment protection for contractors and homeowners in Kenya.",
  },
  {
    taskType: "CONTENT_COPY",
    label: "Content copy",
    system: "Draft short campaign copy. Respond with ONLY a JSON object.",
    userPrompt: "CAMPAIGN_NAME: Milestone Protection\nCORE_MESSAGE: Money should follow the agreement.\nCTA: Learn more",
  },
  {
    taskType: "CREATIVE_IDEATION",
    label: "Creative ideation",
    system: "Propose creative variants. Respond with ONLY a JSON object.",
    userPrompt: "CAMPAIGN_NAME: Milestone Protection\nCORE_MESSAGE: Money should follow the agreement.\nCTA: Learn more",
  },
  {
    taskType: "AUDIENCE_CLASSIFICATION",
    label: "Audience classification",
    system: "Classify the target audience. Respond with ONLY a JSON object.",
    userPrompt: "SEGMENT_NAME: Contractors and homeowners managing milestone payments in Kenya.",
  },
  {
    taskType: "IMPACT_ANALYSIS",
    label: "Impact analysis",
    system: "Write one short sentence of impact context. Respond with ONLY a JSON object.",
    userPrompt: "ACTION_TYPE: RESUME_JOURNEY\nDETERMINISTIC_REASON: Journey abandoned at SecureLink draft step.\nLIFECYCLE_STATE: REGISTERED",
  },
  {
    taskType: "GROWTH_RECOMMENDATION",
    label: "Growth Director recommendation synthesis",
    system: "Write one short explanatory sentence per recommendation id. Respond with ONLY a JSON object.",
    userPrompt: `RANKED_RECOMMENDATIONS:\n${JSON.stringify({ id: "00000000-0000-0000-0000-000000000000", title: "Benchmark fixture", actionType: "NO_ACTION", reason: "Fixture-only test row.", priority: "LOW", confidence: "LOW" })}`,
  },
];

export interface BenchmarkRowResult {
  taskType: AITaskType;
  label: string;
  outcome: "SUCCESS" | "MALFORMED_OUTPUT" | "NO_AVAILABLE_MODEL" | "NOT_IMPLEMENTED" | "EXECUTION_ERROR" | "BUDGET_EXCEEDED";
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  schemaValid: boolean | null;
}

export async function runBenchmarkSuite(actorUserId: string): Promise<BenchmarkRowResult[]> {
  const results: BenchmarkRowResult[] = [];

  for (const fixture of FIXTURES) {
    const result = await runStructuredTask({
      taskType: fixture.taskType,
      system: fixture.system,
      userPrompt: fixture.userPrompt,
      schema: permissiveSchema,
      requestedByUserId: actorUserId,
      maxOutputTokens: 400,
    });

    if (result.status === "SUCCESS") {
      results.push({
        taskType: fixture.taskType,
        label: fixture.label,
        outcome: "SUCCESS",
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        estimatedCostUsd: result.estimatedCostUsd,
        schemaValid: true,
      });
    } else if (result.status === "MALFORMED_OUTPUT") {
      results.push({ taskType: fixture.taskType, label: fixture.label, outcome: "MALFORMED_OUTPUT", provider: null, model: null, latencyMs: null, estimatedCostUsd: null, schemaValid: false });
    } else {
      results.push({
        taskType: fixture.taskType,
        label: fixture.label,
        outcome: result.status,
        provider: null,
        model: null,
        latencyMs: null,
        estimatedCostUsd: null,
        schemaValid: null,
      });
    }
  }

  // Persist one isBenchmark model_performance row per fixture that
  // actually reached a model, so benchmark history is queryable alongside
  // organic usage aggregates. sampleCount is deliberately 1 (one fixture,
  // one run) — confidence is always LOW/INSUFFICIENT_DATA as a result,
  // which is honest: a single fixture run is a smoke test, not a
  // statistically meaningful sample.
  const now = new Date();
  for (const r of results) {
    if (!r.provider || !r.model) continue;
    const [providerRow] = await db.select().from(schema.aiProviders).where(eq(schema.aiProviders.key, r.provider)).limit(1);
    if (!providerRow) continue;
    const [modelRow] = await db
      .select()
      .from(schema.aiModels)
      .where(and(eq(schema.aiModels.providerId, providerRow.id), eq(schema.aiModels.modelKey, r.model)))
      .limit(1);
    if (!modelRow) continue;

    await db.insert(schema.modelPerformance).values({
      providerId: providerRow.id,
      modelId: modelRow.id,
      taskType: r.taskType,
      sampleCount: 1,
      successRate: r.outcome === "SUCCESS" ? "1" : "0",
      schemaValidRate: r.schemaValid !== null ? String(r.schemaValid ? 1 : 0) : null,
      humanAcceptanceRate: null,
      revisionRate: null,
      avgLatencyMs: r.latencyMs !== null ? String(r.latencyMs) : null,
      avgCostUsd: r.estimatedCostUsd !== null ? String(r.estimatedCostUsd) : null,
      fallbackRate: "0",
      evaluationWindowStart: now,
      evaluationWindowEnd: now,
      confidence: "LOW",
      isBenchmark: true,
    });
  }

  await recordAuditEvent({
    eventType: "MODEL_BENCHMARK_RUN",
    actorUserId,
    targetType: "model_benchmark",
    metadata: {
      fixtureCount: FIXTURES.length,
      successCount: results.filter((r) => r.outcome === "SUCCESS").length,
      outcomes: results.map((r) => ({ taskType: r.taskType, outcome: r.outcome })),
    },
  });

  return results;
}
