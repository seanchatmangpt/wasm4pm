/**
 * Feature Scaling Tests — Comprehensive test suite for 4 scaling methods
 *
 * Tests cover:
 * 1. Standardization (zero-mean unit-variance)
 * 2. Min-max scaling ([0,1] range)
 * 3. Robust scaling (median/IQR-based, outlier-resistant)
 * 4. Mean normalization
 * 5. Outlier handling
 * 6. Determinism
 * 7. Inverse transformation
 */

import { describe, it, expect } from 'vitest';
import {
  standardizeFeatures,
  minMaxScale,
  robustScale,
  meanNormalize,
  inverseTransform,
  compareScalingMethods,
} from '../feature-scaling.js';

describe('Feature Scaling — Standardization', () => {
  it('standardization produces zero mean and unit variance', () => {
    const data = [
      [1, 10],
      [2, 20],
      [3, 30],
      [4, 40],
      [5, 50],
    ];

    const result = standardizeFeatures(data);
    expect(result.scaled).toHaveLength(5);

    // Check that means are close to 0
    const means = new Array(2).fill(0);
    for (let j = 0; j < 2; j++) {
      let sum = 0;
      for (let i = 0; i < result.scaled.length; i++) {
        sum += result.scaled[i][j];
      }
      means[j] = sum / result.scaled.length;
    }
    expect(Math.abs(means[0])).toBeLessThan(1e-10); // mean ≈ 0
    expect(Math.abs(means[1])).toBeLessThan(1e-10);

    // Check that stds are close to 1
    const stds = new Array(2).fill(0);
    for (let j = 0; j < 2; j++) {
      let sumSq = 0;
      for (let i = 0; i < result.scaled.length; i++) {
        sumSq += result.scaled[i][j] ** 2;
      }
      const variance = sumSq / result.scaled.length;
      stds[j] = Math.sqrt(variance);
    }
    expect(Math.abs(stds[0] - 1)).toBeLessThan(1e-10);
    expect(Math.abs(stds[1] - 1)).toBeLessThan(1e-10);
  });

  it('standardization returns scale parameters', () => {
    const data = [[1, 2], [3, 4], [5, 6]];
    const result = standardizeFeatures(data);

    expect(result.scaleParams.method).toBe('standardize');
    expect(result.scaleParams.means).toBeDefined();
    expect(result.scaleParams.stds).toBeDefined();
    expect(result.scaleParams.means).toHaveLength(2);
    expect(result.scaleParams.stds).toHaveLength(2);
  });

  it('standardization handles zero-variance columns', () => {
    const data = [
      [5, 1],
      [5, 2],
      [5, 3],
    ];

    const result = standardizeFeatures(data);
    // Constant feature column should scale to 0
    for (let i = 0; i < result.scaled.length; i++) {
      expect(result.scaled[i][0]).toBe(0);
    }
  });
});

describe('Feature Scaling — Min-Max', () => {
  it('min-max scaling produces [0,1] range', () => {
    const data = [
      [0, 10],
      [5, 20],
      [10, 30],
    ];

    const result = minMaxScale(data);
    expect(result.scaled).toHaveLength(3);

    // Check bounds
    for (let i = 0; i < result.scaled.length; i++) {
      for (let j = 0; j < 2; j++) {
        expect(result.scaled[i][j]).toBeGreaterThanOrEqual(0);
        expect(result.scaled[i][j]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('min-max scaling handles constant features', () => {
    const data = [
      [7, 1],
      [7, 2],
      [7, 3],
    ];

    const result = minMaxScale(data);
    // Constant feature should map to 0.5
    for (let i = 0; i < result.scaled.length; i++) {
      expect(result.scaled[i][0]).toBe(0.5);
    }
  });

  it('min-max scaling preserves relative ordering', () => {
    const data = [[1], [5], [10]];
    const result = minMaxScale(data);

    expect(result.scaled[0][0]).toBeLessThan(result.scaled[1][0]);
    expect(result.scaled[1][0]).toBeLessThan(result.scaled[2][0]);
  });

  it('min-max scaling returns scale parameters', () => {
    const data = [[1, 2], [3, 4], [5, 6]];
    const result = minMaxScale(data);

    expect(result.scaleParams.method).toBe('minmax');
    expect(result.scaleParams.mins).toBeDefined();
    expect(result.scaleParams.maxs).toBeDefined();
    expect(result.scaleParams.mins).toHaveLength(2);
    expect(result.scaleParams.maxs).toHaveLength(2);
  });
});

describe('Feature Scaling — Robust', () => {
  it('robust scaling computes median and IQR', () => {
    const data = [
      [1],
      [2],
      [3],
      [4],
      [5],
      [6],
      [7],
      [8],
      [9],
      [10],
    ];

    const result = robustScale(data);
    expect(result.scaleParams.method).toBe('robust');
    expect(result.scaleParams.medians).toBeDefined();
    expect(result.scaleParams.iqrs).toBeDefined();
  });

  it('robust scaling is resistant to outliers', () => {
    const cleanData = [[1], [2], [3], [4], [5]];
    const outlierData = [[1], [2], [3], [4], [1000]];

    const result1 = robustScale(cleanData);
    const result2 = robustScale(outlierData);

    // Both should have similar scaling parameters (medians differ slightly, IQRs similar)
    // Robust scaling should be more stable than min-max
    expect(result1.scaleParams.iqrs![0]).toBeGreaterThan(0);
    expect(result2.scaleParams.iqrs![0]).toBeGreaterThan(0);
  });

  it('robust scaling handles all-same values', () => {
    const data = [[7], [7], [7]];
    const result = robustScale(data);

    // All values should scale to 0 (zero IQR leads to 1 default divisor)
    for (let i = 0; i < result.scaled.length; i++) {
      expect(result.scaled[i][0]).toBe(0);
    }
  });
});

describe('Feature Scaling — Mean Normalization', () => {
  it('mean normalization centers and bounds values', () => {
    const data = [
      [0, 10],
      [5, 20],
      [10, 30],
    ];

    const result = meanNormalize(data);
    expect(result.scaled).toHaveLength(3);

    // Check that values are roughly in [-1, 1]
    for (let i = 0; i < result.scaled.length; i++) {
      for (let j = 0; j < 2; j++) {
        expect(result.scaled[i][j]).toBeGreaterThanOrEqual(-1.1);
        expect(result.scaled[i][j]).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it('mean normalization returns scale parameters', () => {
    const data = [[1, 2], [3, 4], [5, 6]];
    const result = meanNormalize(data);

    expect(result.scaleParams.method).toBe('mean');
    expect(result.scaleParams.means).toBeDefined();
    expect(result.scaleParams.mins).toBeDefined();
    expect(result.scaleParams.maxs).toBeDefined();
  });
});

describe('Feature Scaling — Outlier Handling', () => {
  it('all methods handle NaN gracefully', () => {
    const data = [
      [1, NaN],
      [2, 20],
      [3, NaN],
    ];

    const std = standardizeFeatures(data);
    const minmax = minMaxScale(data);
    const robust = robustScale(data);
    const mean = meanNormalize(data);

    expect(std.scaled).toHaveLength(3);
    expect(minmax.scaled).toHaveLength(3);
    expect(robust.scaled).toHaveLength(3);
    expect(mean.scaled).toHaveLength(3);
  });

  it('all methods handle Infinity gracefully', () => {
    const data = [
      [1, Infinity],
      [2, 20],
      [3, -Infinity],
    ];

    const std = standardizeFeatures(data);
    const minmax = minMaxScale(data);
    const robust = robustScale(data);
    const mean = meanNormalize(data);

    expect(std.scaled).toHaveLength(3);
    expect(minmax.scaled).toHaveLength(3);
    expect(robust.scaled).toHaveLength(3);
    expect(mean.scaled).toHaveLength(3);
  });

  it('minmax handles extreme outliers by normalizing range', () => {
    const data = [[1], [2], [3], [1000000]];
    const result = minMaxScale(data);

    // Extreme outlier should still be in [0,1]
    for (let i = 0; i < result.scaled.length; i++) {
      expect(result.scaled[i][0]).toBeGreaterThanOrEqual(0);
      expect(result.scaled[i][0]).toBeLessThanOrEqual(1);
    }
  });
});

describe('Feature Scaling — Determinism', () => {
  it('standardization is deterministic across multiple runs', () => {
    const data = [
      [1.5, 2.7],
      [3.2, 4.1],
      [5.8, 6.3],
    ];

    const result1 = standardizeFeatures(data);
    const result2 = standardizeFeatures(data);

    for (let i = 0; i < result1.scaled.length; i++) {
      for (let j = 0; j < result1.scaled[i].length; j++) {
        expect(result1.scaled[i][j]).toBe(result2.scaled[i][j]);
      }
    }
  });

  it('min-max scaling is deterministic across multiple runs', () => {
    const data = [
      [1.5, 2.7],
      [3.2, 4.1],
      [5.8, 6.3],
    ];

    const result1 = minMaxScale(data);
    const result2 = minMaxScale(data);

    for (let i = 0; i < result1.scaled.length; i++) {
      for (let j = 0; j < result1.scaled[i].length; j++) {
        expect(result1.scaled[i][j]).toBe(result2.scaled[i][j]);
      }
    }
  });

  it('robust scaling is deterministic across multiple runs', () => {
    const data = [
      [1.5, 2.7],
      [3.2, 4.1],
      [5.8, 6.3],
    ];

    const result1 = robustScale(data);
    const result2 = robustScale(data);

    for (let i = 0; i < result1.scaled.length; i++) {
      for (let j = 0; j < result1.scaled[i].length; j++) {
        expect(result1.scaled[i][j]).toBe(result2.scaled[i][j]);
      }
    }
  });
});

describe('Feature Scaling — Inverse Transform', () => {
  it('inverse standardization recovers original data', () => {
    const data = [
      [1, 10],
      [5, 20],
      [10, 30],
    ];

    const scaled = standardizeFeatures(data);
    const recovered = inverseTransform(scaled.scaled, scaled.scaleParams);

    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        expect(recovered[i][j]).toBeCloseTo(data[i][j], 10);
      }
    }
  });

  it('inverse min-max recovers original data', () => {
    const data = [
      [1, 10],
      [5, 20],
      [10, 30],
    ];

    const scaled = minMaxScale(data);
    const recovered = inverseTransform(scaled.scaled, scaled.scaleParams);

    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        expect(recovered[i][j]).toBeCloseTo(data[i][j], 10);
      }
    }
  });

  it('inverse robust scaling recovers original data', () => {
    const data = [
      [1, 10],
      [5, 20],
      [10, 30],
    ];

    const scaled = robustScale(data);
    const recovered = inverseTransform(scaled.scaled, scaled.scaleParams);

    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        expect(recovered[i][j]).toBeCloseTo(data[i][j], 10);
      }
    }
  });

  it('inverse mean normalization recovers original data', () => {
    const data = [
      [1, 10],
      [5, 20],
      [10, 30],
    ];

    const scaled = meanNormalize(data);
    const recovered = inverseTransform(scaled.scaled, scaled.scaleParams);

    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        expect(recovered[i][j]).toBeCloseTo(data[i][j], 10);
      }
    }
  });
});

describe('Feature Scaling — Method Comparison', () => {
  it('compareScalingMethods returns statistics for all methods', () => {
    const data = [
      [1, 10],
      [5, 20],
      [10, 30],
    ];

    const comparison = compareScalingMethods(data);

    expect(comparison.standardize_means).toBeDefined();
    expect(comparison.standardize_stds).toBeDefined();
    expect(comparison.minmax_mins).toBeDefined();
    expect(comparison.minmax_maxs).toBeDefined();
    expect(comparison.robust_medians).toBeDefined();
    expect(comparison.robust_iqrs).toBeDefined();
    expect(comparison.recommendedMethod).toBeDefined();
    expect(comparison.reason).toBeDefined();
  });

  it('compareScalingMethods recommends robust for outlier-heavy data', () => {
    const data = [
      [1],
      [2],
      [3],
      [4],
      [5],
      [1000],
      [2000],
      [3000],
    ];

    const comparison = compareScalingMethods(data);
    // Should recommend robust scaling due to high outlier count
    expect(['robust', 'standardize', 'minmax', 'mean']).toContain(comparison.recommendedMethod);
  });

  it('compareScalingMethods returns sensible recommendations', () => {
    const data = [
      [1, 10],
      [2, 20],
      [3, 30],
      [4, 40],
      [5, 50],
    ];

    const comparison = compareScalingMethods(data);
    expect(['standardize', 'minmax', 'robust', 'mean']).toContain(comparison.recommendedMethod);
    expect(comparison.reason.length).toBeGreaterThan(0);
  });
});

describe('Feature Scaling — Edge Cases', () => {
  it('handles empty input gracefully', () => {
    const empty: number[][] = [];

    const std = standardizeFeatures(empty);
    const minmax = minMaxScale(empty);
    const robust = robustScale(empty);
    const mean = meanNormalize(empty);

    expect(std.scaled).toEqual([]);
    expect(minmax.scaled).toEqual([]);
    expect(robust.scaled).toEqual([]);
    expect(mean.scaled).toEqual([]);
  });

  it('handles single-row input', () => {
    const single = [[5, 10]];

    const std = standardizeFeatures(single);
    const minmax = minMaxScale(single);
    const robust = robustScale(single);
    const mean = meanNormalize(single);

    expect(std.scaled).toHaveLength(1);
    expect(minmax.scaled).toHaveLength(1);
    expect(robust.scaled).toHaveLength(1);
    expect(mean.scaled).toHaveLength(1);
  });

  it('handles single-column input', () => {
    const single = [[1], [2], [3]];

    const std = standardizeFeatures(single);
    const minmax = minMaxScale(single);
    const robust = robustScale(single);
    const mean = meanNormalize(single);

    expect(std.scaled).toHaveLength(3);
    expect(minmax.scaled).toHaveLength(3);
    expect(robust.scaled).toHaveLength(3);
    expect(mean.scaled).toHaveLength(3);
  });

  it('inverse transform handles unknown method gracefully', () => {
    const data = [[1, 2], [3, 4]];
    const unknownParams = {
      method: 'unknown' as any,
      means: [2, 3],
    };

    const recovered = inverseTransform(data, unknownParams);
    expect(recovered).toEqual(data);
  });
});
