import { NextResponse } from "next/server";
import { requireApiCapability } from "@/lib/rbac/guard";
import { runBenchmarkSuite } from "@/lib/model-evaluation/benchmark";

// Manually initiated only — create on `model-config` = OWNER only. Never
// requires OpenAI/Gemini credentials: it runs through the normal AI
// Gateway → Router path, so it benchmarks whatever is actually AVAILABLE
// (mock and/or Anthropic). See docs/PHASE_5_MODEL_PERFORMANCE_AND_COST.md
// Section 27.
export async function POST() {
  const { user, response } = await requireApiCapability("create", "model-config");
  if (response) return response;

  const results = await runBenchmarkSuite(user!.id);
  return NextResponse.json({ results }, { status: 201 });
}
