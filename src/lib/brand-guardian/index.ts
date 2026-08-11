import { z } from "zod";
import { checkText, resultFromFindings, RULE_ENGINE_VERSION, type RuleFinding, type BrandGuardianResult } from "./rules";
import { runStructuredTask } from "@/lib/ai/tasks/run-structured-task";

// Brand Guardian: a doctrine-checking service, not an autonomous agent —
// see the Phase 2 brief Section 13. The deterministic rule engine
// (src/lib/brand-guardian/rules.ts) is ALWAYS authoritative for the
// PASS/REVISE/BLOCK result — it works with zero AI availability. AI is used
// only as optional narrative enrichment on top of a REVISE/BLOCK result; it
// can never soften or override the deterministic verdict.

const enrichmentSchema = z.object({ narrative: z.string().min(1) });

export interface BrandGuardianOutcome {
  result: BrandGuardianResult;
  reasons: string[];
  offendingStatements: string[];
  recommendedCorrection: string | null;
  doctrineReferences: string[];
  ruleEngineVersion: string;
  aiEnrichmentUsed: boolean;
  aiUsageRecordId: string | null;
}

const ENRICHMENT_SYSTEM_PROMPT = `You are Brand Guardian's narrative assistant for SecurePay. A deterministic rule engine has already found one or more positioning/compliance issues in the text below — your only job is to add one short, plain-language sentence of context for a human reviewer. You cannot change the verdict (that is fixed already). Never invent legal, regulatory, or pricing facts. Respond with ONLY JSON: { "narrative": string }.`;

export async function runBrandGuardian(params: {
  fields: Record<string, string>;
  requestedByUserId: string;
}): Promise<BrandGuardianOutcome> {
  const findings: RuleFinding[] = Object.entries(params.fields).flatMap(([field, text]) =>
    checkText(text, field)
  );
  const result = resultFromFindings(findings);

  const reasons = findings.map((f) => f.reason);
  const offendingStatements = Array.from(new Set(findings.map((f) => f.offendingStatement)));
  const doctrineReferences = Array.from(new Set(findings.map((f) => f.doctrineReference)));
  const recommendedCorrection = findings[0]?.recommendedCorrection ?? null;

  let aiEnrichmentUsed = false;
  let aiUsageRecordId: string | null = null;

  if (result !== "PASS") {
    const findingsSummary = findings.map((f) => `- ${f.reason} (offending: "${f.offendingStatement}")`).join("\n");
    const enrichment = await runStructuredTask({
      taskType: "BRAND_REVIEW",
      system: ENRICHMENT_SYSTEM_PROMPT,
      userPrompt: `Verdict: ${result}\nFindings:\n${findingsSummary}\n\nWrite one short sentence of context for a human reviewer.`,
      schema: enrichmentSchema,
      requestedByUserId: params.requestedByUserId,
      maxOutputTokens: 200,
    });

    if (enrichment.status === "SUCCESS") {
      aiEnrichmentUsed = true;
      aiUsageRecordId = enrichment.usageRecordId;
      const label = enrichment.isMock ? `${enrichment.provider}/mock` : `${enrichment.provider}/${enrichment.model}`;
      reasons.push(`AI note (${label}): ${enrichment.data.narrative}`);
    } else if ("usageRecordId" in enrichment) {
      aiUsageRecordId = enrichment.usageRecordId;
    }
  }

  return {
    result,
    reasons,
    offendingStatements,
    recommendedCorrection,
    doctrineReferences,
    ruleEngineVersion: RULE_ENGINE_VERSION,
    aiEnrichmentUsed,
    aiUsageRecordId,
  };
}
