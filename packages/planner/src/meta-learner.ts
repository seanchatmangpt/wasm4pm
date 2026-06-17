import { estimateDurationMs } from './benchmark-costs.js';
import type { MetaCase } from './receipt-reader.js';

export interface MetaRecommendation {
  algorithm: string;
  score: number;          // (qualityTier * passRate) / estimatedMs
  estimatedMs: number;    // bench estimate or corpus avgDurationMs
  corpusMs: number;
  explanation: string;
}

export function recommendAlgorithm(
  eventCount: number,
  cases: MetaCase[],
  n = 3,
): MetaRecommendation[] {
  const eligible = cases.filter((c) => c.sampleCount > 0);

  const recs: MetaRecommendation[] = eligible.map((c) => {
    const benchMs = estimateDurationMs(c.algorithm, eventCount);
    const estimatedMs = benchMs ?? c.avgDurationMs;
    const score = (c.qualityTier * c.passRate) / Math.max(estimatedMs, 0.001);
    const explanation = `quality=${c.qualityTier} passRate=${c.passRate.toFixed(2)} estimatedMs=${estimatedMs.toFixed(1)}ms score=${score.toFixed(1)}`;
    return {
      algorithm: c.algorithm,
      score,
      estimatedMs,
      corpusMs: c.avgDurationMs,
      explanation,
    };
  });

  recs.sort((a, b) => b.score - a.score);
  return recs.slice(0, n);
}
