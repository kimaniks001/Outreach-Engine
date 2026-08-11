// Deterministic, always-authoritative sensitive-targeting guard. Mirrors
// src/lib/brand-guardian/rules.ts's shape and authority model: this check
// never depends on AI availability, and its result can never be softened or
// overridden — including by the AI classification task that proposes
// audience fields in the first place (src/lib/ai/tasks/analyze-audience.ts
// re-validates every AI-proposed field through this module before writing
// anything). See docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 6/7:
// target commercial situations and intent, never sensitive personal traits.

export const TARGETING_GUARD_VERSION = "phase3-targeting-guard-v1";

export interface TargetingFinding {
  field: string;
  reason: string;
  offendingStatement: string;
  category: string;
}

// Each category matches the brief's explicit prohibited-dimension list plus
// the closest common synonyms/phrasings a human or a language model might
// use. Word-boundary matched, case-insensitive — same technique as
// src/lib/brand-guardian/rules.ts's positioning patterns.
const PROHIBITED_TARGETING_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  {
    pattern:
      /\b(christian|muslim|catholic|protestant|hindu|buddhist|jewish|sikh|atheist|agnostic|evangelical|born-again|religious\s+(belief|affiliation|practice)|church-going|mosque-going|temple-going)s?\b/i,
    category: "religion",
  },
  {
    pattern: /\breligio(n|us)\b/i,
    category: "religion",
  },
  {
    pattern:
      /\b(ethnic(ity|ally)?|race|racial(ly)?|tribe|tribal|kikuyu|luo|luhya|kalenjin|kamba|somali(?!\s*land)|maasai|caucasian|black\s+people|white\s+people|indigenous\s+group)\b/i,
    category: "ethnicity",
  },
  {
    pattern:
      /\b(hiv|aids|disability|disabled|mental\s+illness|mental\s+health\s+condition|diabetic|diabetes|cancer\s+patient|chronic\s+illness|pregnan(t|cy)|medical\s+condition|health\s+condition)\b/i,
    category: "health",
  },
  {
    pattern: /\b(gay|lesbian|bisexual|homosexual|heterosexual|transgender|lgbtq\+?|sexual\s+orientation|gender\s+identity)\b/i,
    category: "sexual orientation / gender identity",
  },
  {
    pattern:
      /\b(political\s+(party|affiliation|belief|view)s?|supports?\s+(the\s+)?[A-Z][a-z]+\s+party|voted\s+for|voter\s+registration|conservative\s+voters?|liberal\s+voters?|opposition\s+supporters?|ruling\s+party\s+supporters?)\b/i,
    category: "political beliefs",
  },
  {
    pattern: /\b(immigration\s+status|undocumented|asylum\s+seeker|refugee\s+status|criminal\s+record|genetic\s+(data|information|trait))\b/i,
    category: "other sensitive personal trait",
  },
];

export function checkTargetingText(text: string, fieldLabel: string): TargetingFinding[] {
  if (!text) return [];
  const findings: TargetingFinding[] = [];
  for (const { pattern, category } of PROHIBITED_TARGETING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        field: fieldLabel,
        reason: `${fieldLabel} references a prohibited targeting dimension (${category}).`,
        offendingStatement: match[0],
        category,
      });
    }
  }
  return findings;
}

// Runs the guard across every free-text targeting field a caller wants
// validated (human-submitted or AI-proposed) and throws on the first
// violation found — the write is rejected outright, never silently
// stripped, so the caller sees exactly what was blocked and why. This
// mirrors src/lib/opportunity/money-flow.ts's discipline of never trusting
// AI output verbatim.
export function assertNoProhibitedTargeting(fields: Record<string, string | null | undefined>): void {
  const findings = Object.entries(fields).flatMap(([field, text]) => checkTargetingText(text ?? "", field));
  if (findings.length > 0) {
    const detail = findings.map((f) => f.reason).join(" ");
    throw new ProhibitedTargetingError(detail, findings);
  }
}

export class ProhibitedTargetingError extends Error {
  findings: TargetingFinding[];
  constructor(message: string, findings: TargetingFinding[]) {
    super(message);
    this.name = "ProhibitedTargetingError";
    this.findings = findings;
  }
}
