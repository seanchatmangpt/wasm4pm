import { describe, it, expect } from 'vitest';
import { recommendAlgorithm } from '../meta-learner.js';
import type { MetaCase } from '../receipt-reader.js';

const CASES: MetaCase[] = [
  { algorithm: 'dfg',         qualityTier: 30, avgDurationMs: 1.0, passRate: 1.0, sampleCount: 1 },
  { algorithm: 'heuristic_miner', qualityTier: 50, avgDurationMs: 3.0, passRate: 1.0, sampleCount: 1 },
  { algorithm: 'ilp',         qualityTier: 90, avgDurationMs: 80.0, passRate: 1.0, sampleCount: 1 },
  { algorithm: 'bad_algo',    qualityTier: 50, avgDurationMs: 1.0, passRate: 0.0, sampleCount: 1 },
  { algorithm: 'no_samples',  qualityTier: 50, avgDurationMs: 1.0, passRate: 1.0, sampleCount: 0 },
];

describe('recommendAlgorithm', () => {
  it('returns empty array for empty cases', () => {
    expect(recommendAlgorithm(1000, [])).toEqual([]);
  });
  it('excludes sampleCount=0 algorithms', () => {
    expect(recommendAlgorithm(1000, CASES).map(r => r.algorithm)).not.toContain('no_samples');
  });
  it('passRate=0 algorithms are not in top-3', () => {
    expect(recommendAlgorithm(1000, CASES, 3).map(r => r.algorithm)).not.toContain('bad_algo');
  });
  it('returns at most n recommendations', () => {
    expect(recommendAlgorithm(1000, CASES, 2)).toHaveLength(2);
  });
  it('all scores are non-negative', () => {
    for (const r of recommendAlgorithm(10000, CASES)) {
      expect(r.score).toBeGreaterThanOrEqual(0);
    }
  });
  it('results are sorted by score descending', () => {
    const recs = recommendAlgorithm(10000, CASES);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i-1]!.score).toBeGreaterThanOrEqual(recs[i]!.score);
    }
  });
});
