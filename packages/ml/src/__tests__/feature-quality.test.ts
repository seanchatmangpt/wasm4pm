import { describe, it, expect } from 'vitest';
import { assessFeatureQuality } from '../feature-quality.js';

describe('feature-quality assessment', () => {
  it('returns zero score for empty input', () => {
    const result = assessFeatureQuality([]);
    expect(result.qualityScore).toBe(0);
    expect(result.warnings).toContain('No features provided');
  });

  it('returns zero score for no columns', () => {
    const result = assessFeatureQuality([[], [], []]);
    expect(result.qualityScore).toBe(0);
    expect(result.warnings).toContain('No feature columns found');
  });

  it('detects zero-variance columns (degenerate log)', () => {
    // All identical features → zero variance
    const degenerateFeatures = [
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ];
    const result = assessFeatureQuality(degenerateFeatures);
    expect(result.zeroVarianceColumns).toBe(3);
    expect(result.qualityScore).toBeLessThan(0.6); // 1.0 - 0.4 (>20% penalty) - 0.1 (small sample)
    expect(result.warnings.some((w) => w.includes('zero-variance'))).toBe(true);
  });

  it('gives high score for varied features', () => {
    // Normal log with good variance (extended for no small-sample penalty)
    const normalFeatures = [
      [1.0, 10.5, 100],
      [2.0, 20.3, 200],
      [3.0, 30.1, 150],
      [4.0, 40.7, 250],
      [5.0, 50.2, 180],
      [6.0, 60.1, 220],
      [7.0, 70.4, 190],
      [8.0, 80.2, 270],
      [9.0, 90.3, 210],
      [10.0, 100.5, 260],
    ];
    const result = assessFeatureQuality(normalFeatures);
    expect(result.qualityScore).toBeGreaterThan(0.7);
    expect(result.zeroVarianceColumns).toBe(0);
    // May have warnings about correlations, but that's OK
  });

  it('penalizes highly correlated features', () => {
    // Columns 0 and 1 are perfectly correlated (col1 = 2*col0)
    const correlatedFeatures = [
      [1, 2, 10],
      [2, 4, 20],
      [3, 6, 15],
      [4, 8, 25],
      [5, 10, 18],
    ];
    const result = assessFeatureQuality(correlatedFeatures);
    expect(result.correlatedPairs.length).toBeGreaterThan(0);
    expect(result.qualityScore).toBeLessThan(0.9);
    expect(result.warnings.some((w) => w.includes('correlated'))).toBe(true);
  });

  it('penalizes small sample size', () => {
    const smallSample = [[1, 2, 3], [4, 5, 6]];
    const result = assessFeatureQuality(smallSample);
    expect(result.qualityScore).toBeLessThan(1.0);
    expect(result.warnings.some((w) => w.includes('Only'))).toBe(true);
  });

  it('clamps score to [0, 1]', () => {
    // Even with multiple penalties, score should stay in [0, 1]
    const poorFeatures = Array(3).fill([1, 1, 1]); // All identical
    const result = assessFeatureQuality(poorFeatures);
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.qualityScore).toBeLessThanOrEqual(1);
  });

  it('provides recommendations for degenerate features', () => {
    const degenerateFeatures = [
      [5, 5, 5],
      [5, 5, 5],
      [5, 5, 5],
    ];
    const result = assessFeatureQuality(degenerateFeatures);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.some((r) => r.includes('Remove'))).toBe(true);
  });

  it('handles mixed quality features', () => {
    // Mix of good variance and correlations
    const mixedFeatures = [
      [1.0, 2.0, 100, 5],
      [2.0, 4.0, 200, 10],
      [3.0, 6.0, 150, 15],
      [4.0, 8.0, 250, 20],
      [5.0, 10.0, 180, 25],
    ];
    const result = assessFeatureQuality(mixedFeatures);
    expect(result.qualityScore).toBeGreaterThan(0);
    expect(result.qualityScore).toBeLessThanOrEqual(1);
    // Some warnings expected due to correlation
    expect(result.correlatedPairs.length).toBeGreaterThan(0);
  });
});
