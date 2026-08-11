import type { RecommendationCandidate } from "./candidates";

// Explainable, deterministic ranking — Phase 5 brief Section 17. NOT
// opaque ML: a fixed weighted-sum formula over dimensions each candidate-
// generating rule already assigned from its own concrete evidence
// (src/lib/growth-director/candidates.ts). AI may explain a score; it
// cannot change one (see src/lib/growth-director/engine.ts).

export const RANKING_ENGINE_VERSION = "phase5-ranking-v1";

const WEIGHTS = {
  impact: 0.35,
  confidence: 0.2,
  evidence: 0.15,
  effort: -0.1,
  risk: -0.15,
  cost: -0.05,
};

function confidenceScore(c: RecommendationCandidate["confidence"]): number {
  return { INSUFFICIENT_DATA: 0, LOW: 33, MEDIUM: 66, HIGH: 100 }[c];
}
function riskScore(r: RecommendationCandidate["riskLevel"]): number {
  return { LOW: 10, MEDIUM: 50, HIGH: 90 }[r];
}

export interface RankedCandidate {
  candidate: RecommendationCandidate;
  score: number;
  explanation: {
    engineVersion: string;
    dimensions: Record<string, { raw: number; weight: number; contribution: number }>;
  };
}

export function rankCandidates(candidates: RecommendationCandidate[]): RankedCandidate[] {
  const ranked = candidates.map((candidate) => {
    const dims = {
      impact: { raw: candidate.impactScore, weight: WEIGHTS.impact },
      confidence: { raw: confidenceScore(candidate.confidence), weight: WEIGHTS.confidence },
      evidence: { raw: candidate.evidenceScore, weight: WEIGHTS.evidence },
      effort: { raw: candidate.effortScore, weight: WEIGHTS.effort },
      risk: { raw: riskScore(candidate.riskLevel), weight: WEIGHTS.risk },
      cost: { raw: candidate.costScore, weight: WEIGHTS.cost },
    };

    const dimensions: RankedCandidate["explanation"]["dimensions"] = {};
    let score = 0;
    for (const [key, { raw, weight }] of Object.entries(dims)) {
      const contribution = Math.round(raw * weight * 100) / 100;
      dimensions[key] = { raw, weight, contribution };
      score += contribution;
    }

    return {
      candidate,
      score: Math.round(score * 100) / 100,
      explanation: { engineVersion: RANKING_ENGINE_VERSION, dimensions },
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
