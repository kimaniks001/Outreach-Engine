// docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 8. Mirrors
// src/lib/opportunity/scoring.ts exactly: deliberately simple and
// explainable, no machine learning, no hidden weighting. Every number here
// can be read back as "why" by a human reviewer.

export const SCORE_DIMENSIONS = [
  "problemFit",
  "productFit",
  "intent",
  "reachability",
  "commercialValue",
  "evidenceStrength",
] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

// Optional per docs/PHASE_3_TARGETING_AND_DISTRIBUTION.md Section 8 —
// included in the total only when present, so a score computed before
// channel recommendations exist isn't penalized for a dimension that
// doesn't apply yet.
export const OPTIONAL_SCORE_DIMENSION = "channelFit" as const;

export type ScoreComponents = Record<ScoreDimension, number> & { channelFit?: number | null };
export type ScoreExplanation = Partial<Record<ScoreDimension | "channelFit", string>>;

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Total is the unweighted average of the required dimensions, plus
// channelFit when supplied — rounded, no ML. See scoring.ts for the
// opportunity-domain precedent this mirrors.
export function computeTotalScore(components: ScoreComponents): number {
  const values = SCORE_DIMENSIONS.map((dimension) => clampScore(components[dimension]));
  if (components.channelFit !== undefined && components.channelFit !== null) {
    values.push(clampScore(components.channelFit));
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  return clampScore(sum / values.length);
}

export function buildScoreExplanation(
  components: ScoreComponents,
  notes: ScoreExplanation
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const dimension of SCORE_DIMENSIONS) {
    result[dimension] = notes[dimension] ?? `${dimension}: ${clampScore(components[dimension])}/100 (no rationale provided).`;
  }
  if (components.channelFit !== undefined && components.channelFit !== null) {
    result.channelFit = notes.channelFit ?? `channelFit: ${clampScore(components.channelFit)}/100 (no rationale provided).`;
  }
  return result;
}

export const SCORE_DIMENSION_LABELS: Record<ScoreDimension | "channelFit", string> = {
  problemFit: "Problem Fit",
  productFit: "Product Fit",
  intent: "Intent",
  reachability: "Reachability",
  commercialValue: "Commercial Value",
  evidenceStrength: "Evidence Strength",
  channelFit: "Channel Fit",
};
