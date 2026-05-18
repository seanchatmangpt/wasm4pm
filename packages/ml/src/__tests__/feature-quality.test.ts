import { describe, it, expect } from 'vitest';
import { assessFeatureQuality } from '../feature-quality.js';
import type { FeatureMatrix } from '../types.js';

describe('assessFeatureQuality', () => {
  it('detects zero-variance features', () => {
    const features: FeatureMatrix = {
      data: [
        [5, 10],
        [5, 15],
        [5, 20],
      ],
      featureNames: ['constant', 'varying'],
      caseIds: ['c1', 'c2', 'c3'],
      targets: [],
      labels: [],
    };

    const result = assessFeatureQuality(features);
    expect(result.hasProblematicFeatures).toBe(true);
    expect(result.issues.some((i) => i.type === 'zero_variance')).toBe(true);
    expect(result.score).toBeLessThan(1);
  });

  it('detects high correlation between features', () => {
    const features: FeatureMatrix = {
      data: [
        [1, 2],
        [2, 4],
        [3, 6],
        [4, 8],
      ],
      featureNames: ['x', 'y'],
      caseIds: ['c1', 'c2', 'c3', 'c4'],
      targets: [],
      labels: [],
    };

    const result = assessFeatureQuality(features);
    expect(result.issues.some((i) => i.type === 'high_correlation')).toBe(true);
    expect(result.hasProblematicFeatures).toBe(true);
  });

  it('scores high for good features', () => {
    const features: FeatureMatrix = {
      data: [
        [1, 2],
        [2, -5],
        [3, 8],
        [4, -2],
      ],
      featureNames: ['a', 'b'],
      caseIds: ['c1', 'c2', 'c3', 'c4'],
      targets: [],
      labels: [],
    };

    const result = assessFeatureQuality(features);
    expect(result.score).toBeGreaterThan(0.8);
    expect(result.hasProblematicFeatures).toBe(false);
  });

  it('detects missing values', () => {
    const features: FeatureMatrix = {
      data: [
        [1, NaN],
        [2, 10],
        [NaN, 15],
        [4, 20],
        [5, NaN],
      ],
      featureNames: ['a', 'b'],
      caseIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
      targets: [],
      labels: [],
    };

    const result = assessFeatureQuality(features);
    expect(result.issues.some((i) => i.type === 'missing_values')).toBe(true);
    expect(result.recommendations.some((r) => r.includes('missing'))).toBe(true);
  });

  it('handles empty data', () => {
    const features: FeatureMatrix = {
      data: [],
      featureNames: [],
      caseIds: [],
      targets: [],
      labels: [],
    };

    const result = assessFeatureQuality(features);
    expect(result.score).toBe(0);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('recommends feature removal for problematic features', () => {
    const features: FeatureMatrix = {
      data: [
        [5, 5],
        [5, 10],
        [5, 15],
      ],
      featureNames: ['const', 'var'],
      caseIds: ['c1', 'c2', 'c3'],
      targets: [],
      labels: [],
    };

    const result = assessFeatureQuality(features);
    expect(result.recommendations.some((r) => r.includes('Remove'))).toBe(true);
    expect(result.validFeatureCount).toBeLessThan(result.totalFeatureCount);
  });

  it('counts valid features correctly', () => {
    const features: FeatureMatrix = {
      data: [
        [1, 2, 3],
        [2, 4, 6],
        [3, 6, 9],
        [4, 8, 12],
      ],
      featureNames: ['a', 'b', 'c'],
      caseIds: ['c1', 'c2', 'c3', 'c4'],
      targets: [],
      labels: [],
    };

    const result = assessFeatureQuality(features);
    expect(result.totalFeatureCount).toBe(3);
    // b and c are highly correlated with a, but not all marked critical
    expect(result.validFeatureCount).toBeGreaterThan(0);
  });
});
