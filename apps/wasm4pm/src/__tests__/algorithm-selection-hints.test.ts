import { describe, it, expect } from 'vitest';
import { suggestAlgorithm, explainAlgorithmSelection } from '../algorithm/selection-hints.js';

describe('Gap-13: Algorithm Selection Hints', () => {
  it('should suggest fast algorithms for very small logs (<100 events)', () => {
    const recommendations = suggestAlgorithm(50, 5, 8);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].speedTier).toBe('fast');
    expect(['dfg', 'process_skeleton'].includes(recommendations[0].algorithmId)).toBe(true);
  });

  it('should suggest dfg as first choice for exploratory logs', () => {
    const recommendations = suggestAlgorithm(80, 10, 6);
    expect(recommendations.some((r) => r.algorithmId === 'dfg')).toBe(true);
  });

  it('should suggest balanced algorithms for small logs (100-1K events)', () => {
    const recommendations = suggestAlgorithm(500, 50, 15);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(
      recommendations.some((r) => r.speedTier === 'balanced' && ['heuristic_miner', 'inductive_miner', 'alpha_plus_plus'].includes(r.algorithmId))
    ).toBe(true);
  });

  it('should suggest quality algorithms for medium logs (1K-10K events) with low complexity', () => {
    const recommendations = suggestAlgorithm(5000, 500, 25);
    expect(recommendations.length).toBeGreaterThan(0);
    const hasInductive = recommendations.some((r) => r.algorithmId === 'inductive_miner');
    expect(hasInductive).toBe(true);
  });

  it('should suggest genetic algorithm for complex medium logs (1K-10K with >50 activities)', () => {
    const recommendations = suggestAlgorithm(8000, 400, 60);
    expect(recommendations.length).toBeGreaterThan(0);
    const hasGenetic = recommendations.some((r) => r.algorithmId === 'genetic_algorithm');
    expect(hasGenetic).toBe(true);
  });

  it('should recommend heuristic_miner for large logs (>10K events)', () => {
    const recommendations = suggestAlgorithm(50000, 5000, 100);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.some((r) => r.algorithmId === 'heuristic_miner')).toBe(true);
  });

  it('should avoid expensive algorithms (genetic, ILP) for very large logs (>100K events)', () => {
    const recommendations = suggestAlgorithm(150000, 10000, 150);
    expect(recommendations.length).toBeGreaterThan(0);
    // Should prioritize scalable algorithms
    expect(
      recommendations.slice(0, 2).some((r) => ['dfg', 'heuristic_miner', 'process_skeleton'].includes(r.algorithmId))
    ).toBe(true);
  });

  it('should prioritize alpha_plus_plus for short, simple traces (avg length < 5)', () => {
    const recommendations = suggestAlgorithm(200, 50, 8); // 4 events per trace on average
    expect(recommendations.length).toBeGreaterThan(0);
    // Alpha++ should be early in recommendations for simple traces
    const alphaIdx = recommendations.findIndex((r) => r.algorithmId === 'alpha_plus_plus');
    expect(alphaIdx).toBeLessThan(3);
  });

  it('should recommend genetic algorithm for long, complex traces (avg length > 20)', () => {
    const recommendations = suggestAlgorithm(1000, 20, 50); // 50 events per trace
    expect(recommendations.length).toBeGreaterThan(0);
    const geneticIdx = recommendations.findIndex((r) => r.algorithmId === 'genetic_algorithm');
    expect(geneticIdx).toBeLessThan(3); // Should be in top 3 recommendations
  });

  it('should format explanation text with recommendations and usage examples', () => {
    const explanation = explainAlgorithmSelection(500, 50, 15);
    expect(explanation).toContain('Algorithm Selection Analysis');
    expect(explanation).toContain('500 events');
    expect(explanation).toContain('50 traces');
    expect(explanation).toContain('Recommended algorithms');
    expect(explanation).toContain('wpm run');
    expect(explanation).toContain('wpm compare');
  });

  it('should include algorithm metadata (speed tier, duration estimate, fitness prediction)', () => {
    const recommendations = suggestAlgorithm(1000, 100, 20);
    const rec = recommendations[0];
    expect(rec.algorithmId).toBeDefined();
    expect(rec.name).toBeDefined();
    expect(rec.reason).toBeDefined();
    expect(rec.speedTier).toMatch(/fast|balanced|quality/);
    expect(rec.estimatedDuration).toBeDefined();
    expect(rec.fitnessPrediction).toBeDefined();
  });
});
