// Deterministic Brand Guardian rule engine. This is the AUTHORITATIVE check
// — it never depends on AI availability, so positioning enforcement works
// even when no AI provider is configured. See
// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 13 and
// docs/SECUREPAY_POSITIONING_RULES.md.

export const RULE_ENGINE_VERSION = "phase2-rules-v1";

export type BrandGuardianResult = "PASS" | "REVISE" | "BLOCK";

export interface RuleFinding {
  severity: "BLOCK" | "REVISE";
  reason: string;
  offendingStatement: string;
  recommendedCorrection: string;
  doctrineReference: string;
}

// docs/SECUREPAY_POSITIONING_RULES.md Section 3 — the exact prohibited
// framings, plus the common ways a language model (or a human) phrases
// them. Word-boundary matched, case-insensitive.
const PROHIBITED_POSITIONING: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bwallet\b/i, label: "described as a wallet" },
  { pattern: /\b(a |an |the )?bank\b/i, label: "described as a bank" },
  { pattern: /\bm-?pesa\s+(competitor|alternative|rival)\b/i, label: "framed as an M-PESA competitor" },
  { pattern: /\b(ordinary |just a |another )?payment\s+app\b/i, label: "described as an ordinary payment app" },
  { pattern: /\bescrow\b/i, label: "described as an escrow product" },
];

const POSITIONING_CORRECTION =
  'Reframe using SecurePay\'s core positioning: "Money should follow the agreement." / "SecurePay is the agreement layer for money." Do not describe SecurePay as a wallet, a bank, an M-PESA competitor, an ordinary payment app, or an escrow product.';

// Absolute/compliance-shaped claims the Outreach Engine cannot substantiate
// automatically — see docs/AI_GOVERNANCE.md Section 3 ("must not make
// legal/compliance claims").
const UNSUPPORTED_CLAIM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bguarantee(d|s)?\b/i, label: "an unqualified guarantee" },
  { pattern: /\b100%\s*(safe|secure|guaranteed|risk-free)\b/i, label: "an absolute safety claim" },
  { pattern: /\bno\s+risk\b/i, label: "a no-risk claim" },
  { pattern: /\bnever\s+fails?\b/i, label: "an absolute reliability claim" },
  { pattern: /\blegally\s+binding\b/i, label: "an unreviewed legal claim" },
  { pattern: /\b(licen[sc]ed|regulated)\s+by\b/i, label: "an unreviewed regulatory claim" },
];

const CLAIM_CORRECTION =
  "Remove or qualify absolute/compliance claims (e.g. \"guaranteed\", \"100% safe\", \"legally binding\", \"regulated by\"). The Outreach Engine cannot substantiate legal/regulatory claims automatically — see docs/AI_GOVERNANCE.md Section 3.";

// Pricing communication is a HIGH-risk action requiring separate approval —
// see docs/AI_GOVERNANCE.md Section 4. Any pricing reference in creative
// copy gets flagged, not silently allowed through.
const PRICING_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bKES\s?\d/i, label: "a KES price reference" },
  { pattern: /\b(ksh|kshs)\.?\s?\d/i, label: "a KSh price reference" },
  { pattern: /\d+(\.\d+)?%\s*(fee|commission|charge)/i, label: "a fee/commission percentage" },
  { pattern: /\bfree\s+(forever|for\s+life)\b/i, label: "a free-forever pricing claim" },
];

const PRICING_CORRECTION =
  "Remove pricing/fee references from campaign creative — pricing communication is a HIGH-risk action requiring separate, explicit approval (see docs/AI_GOVERNANCE.md Section 4).";

export function checkText(text: string, fieldLabel: string): RuleFinding[] {
  const findings: RuleFinding[] = [];

  for (const { pattern, label } of PROHIBITED_POSITIONING) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        severity: "BLOCK",
        reason: `${fieldLabel} is ${label}.`,
        offendingStatement: match[0],
        recommendedCorrection: POSITIONING_CORRECTION,
        doctrineReference: "docs/SECUREPAY_POSITIONING_RULES.md Section 3",
      });
    }
  }

  for (const { pattern, label } of UNSUPPORTED_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        severity: "REVISE",
        reason: `${fieldLabel} contains ${label}.`,
        offendingStatement: match[0],
        recommendedCorrection: CLAIM_CORRECTION,
        doctrineReference: "docs/AI_GOVERNANCE.md Section 3",
      });
    }
  }

  for (const { pattern, label } of PRICING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        severity: "REVISE",
        reason: `${fieldLabel} contains ${label}.`,
        offendingStatement: match[0],
        recommendedCorrection: PRICING_CORRECTION,
        doctrineReference: "docs/AI_GOVERNANCE.md Section 4",
      });
    }
  }

  return findings;
}

export function resultFromFindings(findings: RuleFinding[]): BrandGuardianResult {
  if (findings.some((f) => f.severity === "BLOCK")) return "BLOCK";
  if (findings.some((f) => f.severity === "REVISE")) return "REVISE";
  return "PASS";
}
