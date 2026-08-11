// docs/PHASE_2_INTELLIGENCE_CAMPAIGN_CREATIVE.md Section 10. Deliberately
// simple and explainable — no machine learning, no hidden weighting. Every
// number here can be read back as "why" by a human reviewer.

export const SCORE_DIMENSIONS = [
  "problemFit",
  "securepayFit",
  "audienceClarity",
  "commercialValue",
  "reachability",
  "evidenceStrength",
  "urgencyTiming",
] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export type ScoreComponents = Record<ScoreDimension, number>;
export type ScoreExplanation = Partial<Record<ScoreDimension, string>>;

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Total is the unweighted average of the seven dimensions, rounded. Simple
// on purpose — a weighted or ML-based scorer is an explicit non-goal (see
// the Phase 2 brief Section 10: "Do not introduce machine-learning
// scoring").
export function computeTotalScore(components: ScoreComponents): number {
  const values = SCORE_DIMENSIONS.map((dimension) => clampScore(components[dimension]));
  const sum = values.reduce((acc, v) => acc + v, 0);
  return clampScore(sum / SCORE_DIMENSIONS.length);
}

export interface EvidenceForScoring {
  verificationStatus: "VERIFIED" | "NEEDS_REVIEW" | "WEAK_EVIDENCE" | "REJECTED";
  confidence: number; // 0..1
}

// Deterministic, not AI-proposed: evidence strength is derived directly
// from the source_evidence rows themselves, since it is a fact about what
// was actually captured, not a judgment call. A signal with no evidence at
// all scores at the floor and is labeled MANUAL/UNVERIFIED elsewhere (see
// src/lib/intelligence/evidence.ts) — it can never be silently treated as
// strong evidence.
export function deriveEvidenceStrengthScore(evidence: EvidenceForScoring[]): number {
  const usable = evidence.filter((e) => e.verificationStatus !== "REJECTED");
  if (usable.length === 0) return 5; // MANUAL/UNVERIFIED floor

  const perItem = usable.map((e) => {
    const base: Record<EvidenceForScoring["verificationStatus"], number> = {
      VERIFIED: 90,
      NEEDS_REVIEW: 55,
      WEAK_EVIDENCE: 25,
      REJECTED: 0,
    };
    return clampScore(base[e.verificationStatus] * Math.max(0.4, e.confidence));
  });

  const best = Math.max(...perItem);
  const corroborationBonus = usable.length > 1 ? Math.min(10, (usable.length - 1) * 5) : 0;
  return clampScore(best + corroborationBonus);
}

export function buildScoreExplanation(
  components: ScoreComponents,
  notes: ScoreExplanation
): Record<ScoreDimension, string> {
  const result = {} as Record<ScoreDimension, string>;
  for (const dimension of SCORE_DIMENSIONS) {
    result[dimension] = notes[dimension] ?? `${dimension}: ${clampScore(components[dimension])}/100 (no rationale provided).`;
  }
  return result;
}

export const SCORE_DIMENSION_LABELS: Record<ScoreDimension, string> = {
  problemFit: "Problem Fit",
  securepayFit: "SecurePay Fit",
  audienceClarity: "Audience Clarity",
  commercialValue: "Commercial Value",
  reachability: "Reachability",
  evidenceStrength: "Evidence Strength",
  urgencyTiming: "Urgency / Timing",
};
