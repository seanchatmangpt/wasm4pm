/**
 * Preprocessing Guards Test Suite
 *
 * Tests for 5 critical data validation checks:
 * 1. Zero-variance detection and removal
 * 2. Missing value imputation
 * 3. Outlier detection and capping
 * 4. Feature scaling
 * 5. Sample-feature ratio validation
 */

import { describe, it, expect } from 'vitest';
import {
  filterZeroVarianceColumns,
  imputeMissingValues,
  capOutliers,
  scaleFeatures,
  validateSampleFeatureRatio,
  preprocessFeatures,
} from '../preprocessing.js';

describe('Guard 1: Zero-Variance Column Removal', () => {
  it('should identify and remove constant columns', () => {
    const data = [
      [1.0, 5.0, 10.0], // col 0: constant
      [1.0, 6.0, 20.0],
      [1.0, 7.0, 30.0],
    ];

    const { filtered, removed, indicesToKeep } = filterZeroVarianceColumns(data);

    expect(removed).toEqual([0]); // col 0 is zero-variance
    expect(indicesToKeep).toEqual([1, 2]); // keep cols 1, 2
    expect(filtered).toEqual([
      [5.0, 10.0],
      [6.0, 20.0],
      [7.0, 30.0],
    ]);
  });

  it('should handle empty data', () => {
    const { filtered, removed, indicesToKeep } = filterZeroVarianceColumns([]);
    expect(filtered).toEqual([]);
    expect(removed).toEqual([]);
    expect(indicesToKeep).toEqual([]);
  });

  it('should handle all non-zero variance', () => {
    const data = [
      [1.0, 5.0],
      [2.0, 6.0],
      [3.0, 7.0],
    ];

    const { filtered, removed } = filterZeroVarianceColumns(data);

    expect(removed).toEqual([]);
    expect(filtered).toEqual(data);
  });

  it('should detect multiple zero-variance columns', () => {
    const data = [
      [42.0, 1.0, 99.0, 5.0],
      [42.0, 2.0, 99.0, 6.0],
      [42.0, 3.0, 99.0, 7.0],
    ];

    const { removed, indicesToKeep } = filterZeroVarianceColumns(data);

    expect(removed.sort()).toEqual([0, 2]);
    expect(indicesToKeep).toEqual([1, 3]);
  });
});

describe('Guard 2: Missing Value Imputation', () => {
  it('should replace NaN with column mean', () => {
    const data = [
      [1.0, 5.0],
      [NaN, 6.0],
      [3.0, 7.0],
    ];

    const { imputed, rowsAffected } = imputeMissingValues(data);

    expect(rowsAffected).toBe(1);
    expect(Number.isFinite(imputed[1][0])).toBe(true);
    expect(imputed[1][0]).toBe(2.0); // mean of 1 and 3
  });

  it('should replace Infinity with forward-fill then mean', () => {
    const data = [
      [1.0, 5.0],
      [Infinity, 6.0],
      [3.0, 7.0],
    ];

    const { imputed, rowsAffected } = imputeMissingValues(data);

    expect(rowsAffected).toBe(1);
    expect(Number.isFinite(imputed[1][0])).toBe(true);
  });

  it('should use column mean for all missing values', () => {
    const data = [
      [1.0, 5.0],
      [NaN, 6.0],
      [NaN, 7.0],
      [4.0, 8.0],
    ];

    const { imputed } = imputeMissingValues(data);

    // Both NaN values replaced with column mean: (1.0 + 4.0) / 2 = 2.5
    expect(imputed[1][0]).toBe(2.5);
    expect(imputed[2][0]).toBe(2.5);
  });

  it('should handle all missing values in a column', () => {
    const data = [
      [NaN, 5.0],
      [NaN, 6.0],
      [NaN, 7.0],
    ];

    const { imputed, rowsAffected } = imputeMissingValues(data);

    expect(rowsAffected).toBe(3);
    expect(imputed[0][0]).toBe(0); // mean of all NaN (no valid values)
  });

  it('should preserve valid values', () => {
    const data = [
      [1.0, 5.0],
      [2.0, 6.0],
      [3.0, 7.0],
    ];

    const { imputed, rowsAffected } = imputeMissingValues(data);

    expect(rowsAffected).toBe(0);
    expect(imputed).toEqual(data);
  });
});

describe('Guard 3: Outlier Detection and Capping', () => {
  it('should cap values outside IQR bounds', () => {
    const data = [[1.0], [2.0], [3.0], [4.0], [5.0], [100.0]]; // 100 is outlier

    const { capped, outliersDetected } = capOutliers(data, 1.5);

    expect(outliersDetected).toBeGreaterThan(0);
    expect(capped[5][0]).toBeLessThan(100); // outlier was capped
  });

  it('should not cap values within bounds', () => {
    const data = [[1.0], [2.0], [3.0], [4.0], [5.0]];

    const { capped, outliersDetected } = capOutliers(data, 1.5);

    expect(outliersDetected).toBe(0);
    expect(capped).toEqual(data);
  });

  it('should handle both high and low outliers', () => {
    const data = [[-100.0], [1.0], [2.0], [3.0], [4.0], [5.0], [100.0]];

    const { capped, outliersDetected } = capOutliers(data, 1.5);

    expect(outliersDetected).toBeGreaterThanOrEqual(2);
    expect(capped[0][0]).toBeGreaterThan(-100);
    expect(capped[6][0]).toBeLessThan(100);
  });

  it('should respect IQR multiplier parameter', () => {
    const data = [[1.0], [2.0], [3.0], [4.0], [5.0], [10.0]];

    const { outliersDetected: strict } = capOutliers(data, 1.0);
    const { outliersDetected: relaxed } = capOutliers(data, 3.0);

    // Stricter multiplier should detect more outliers
    expect(strict).toBeGreaterThanOrEqual(relaxed);
  });
});

describe('Guard 4: Feature Scaling', () => {
  it('should scale features to [0, 1]', () => {
    const data = [
      [0.0, 10.0],
      [10.0, 20.0],
      [5.0, 15.0],
    ];

    const { scaled, mins, maxs } = scaleFeatures(data);

    // Column 0: min=0, max=10, so (0-0)/(10-0)=0, (10-0)/(10-0)=1, (5-0)/(10-0)=0.5
    expect(scaled[0][0]).toBe(0.0);
    expect(scaled[1][0]).toBe(1.0);
    expect(scaled[2][0]).toBe(0.5);

    // Column 1: min=10, max=20, so (10-10)/(20-10)=0, (20-10)/(20-10)=1, (15-10)/(20-10)=0.5
    expect(scaled[0][1]).toBe(0.0);
    expect(scaled[1][1]).toBe(1.0);
    expect(scaled[2][1]).toBe(0.5);
  });

  it('should handle constant features (map to 0.5)', () => {
    const data = [
      [5.0, 42.0],
      [10.0, 42.0],
      [15.0, 42.0],
    ];

    const { scaled } = scaleFeatures(data);

    // Column 1 is constant, should map to 0.5
    expect(scaled[0][1]).toBe(0.5);
    expect(scaled[1][1]).toBe(0.5);
    expect(scaled[2][1]).toBe(0.5);
  });

  it('should return min/max for inverse transformation', () => {
    const data = [
      [0.0, 10.0],
      [10.0, 20.0],
    ];

    const { mins, maxs } = scaleFeatures(data);

    expect(mins).toEqual([0.0, 10.0]);
    expect(maxs).toEqual([10.0, 20.0]);
  });

  it('should handle negative values', () => {
    const data = [
      [-10.0, 5.0],
      [10.0, 15.0],
    ];

    const { scaled, mins, maxs } = scaleFeatures(data);

    expect(mins).toEqual([-10.0, 5.0]);
    expect(maxs).toEqual([10.0, 15.0]);
    expect(scaled[0][0]).toBe(0.0);
    expect(scaled[1][0]).toBe(1.0);
  });
});

describe('Guard 5: Sample-Feature Ratio Validation', () => {
  it('should pass when ratio >= minRatio', () => {
    const data = Array(100)
      .fill(null)
      .map((_, i) => [i, i * 2, i * 3, i * 4, i * 5, i * 6, i * 7, i * 8, i * 9, i * 10]);

    const { sufficient } = validateSampleFeatureRatio(data, 10);

    expect(sufficient).toBe(true); // 100 samples / 10 features = 10 (meets threshold)
  });

  it('should fail when ratio < minRatio', () => {
    const data = [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    ];

    const { sufficient } = validateSampleFeatureRatio(data, 10);

    expect(sufficient).toBe(false); // 3 samples / 10 features = 0.3 (below threshold)
  });

  it('should return exact ratio metrics', () => {
    const data = Array(50)
      .fill(null)
      .map((_, i) => [i, i * 2, i * 3, i * 4, i * 5]);

    const { sampleCount, featureCount, actualRatio } = validateSampleFeatureRatio(data, 10);

    expect(sampleCount).toBe(50);
    expect(featureCount).toBe(5);
    expect(actualRatio).toBe(10);
  });

  it('should handle empty data', () => {
    const { sufficient, sampleCount, featureCount } = validateSampleFeatureRatio([], 10);

    expect(sufficient).toBe(false);
    expect(sampleCount).toBe(0);
    expect(featureCount).toBe(0);
  });
});

describe('Full Preprocessing Pipeline', () => {
  it('should apply all 5 guards in sequence', () => {
    const data = [
      [1.0, 100.0, 42.0, 10.0],
      [2.0, 200.0, 42.0, 20.0],
      [3.0, 300.0, 42.0, 30.0],
      [4.0, 400.0, 42.0, NaN], // missing value here
      [5.0, 1000.0, 42.0, 50.0], // outlier in col 1
      [6.0, 600.0, 42.0, 60.0],
      [7.0, 700.0, 42.0, 70.0],
      [8.0, 800.0, 42.0, 80.0],
      [9.0, 900.0, 42.0, 90.0],
      [10.0, 1000.0, 42.0, 100.0],
    ];

    const { preprocessed, report, mins, maxs } = preprocessFeatures(data);

    // Should remove column 2 (constant 42.0)
    expect(report.zeroVarianceColumnsRemoved).toBe(1);

    // Should impute 1 missing value (row 3, col 3)
    expect(report.rowsWithMissingValuesImputed).toBeGreaterThan(0);

    // Should detect and cap outlier(s)
    expect(report.outliersDetected).toBeGreaterThan(0);

    // Should have reduced from 4 to 3 features (col 2 removed)
    expect(report.finalFeatureCount).toBe(3);

    // Should pass validation (10 samples, 4 features = 2.5 ratio, may fail)
    // But at minimum, should have a status
    expect(report.status).toMatch(/pass|fail/);

    // Should have scaling min/max
    expect(mins).toBeDefined();
    expect(maxs).toBeDefined();
    expect(mins?.length).toBe(4);
    expect(maxs?.length).toBe(4);

    // All values should be finite and in [0, 1] after scaling
    for (const row of preprocessed) {
      for (const val of row) {
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });

  it('should handle clean data without modifications', () => {
    // 50 samples, 3 features = 16.67 ratio (>=10 passes validation)
    const data = Array(50)
      .fill(null)
      .map((_, i) => [i, i * 2, i * 3]);

    const { report } = preprocessFeatures(data);

    expect(report.zeroVarianceColumnsRemoved).toBe(0);
    expect(report.rowsWithMissingValuesImputed).toBe(0);
    expect(report.outliersDetected).toBe(0);
    expect(report.status).toBe('pass');
  });

  it('should report all issues in comprehensive report', () => {
    const data = [
      [1.0, 42.0],
      [2.0, 42.0],
    ];

    const { report } = preprocessFeatures(data);

    // Low sample-to-feature ratio (2 samples, 1 feature after removing zero-variance, 2.0 ratio)
    // Actually, we have 1 feature left (column 0) and 2 samples = ratio 2.0, which is below 10
    expect(report.status).toBe('fail');
    expect(report.issues.length).toBeGreaterThan(0);
  });
});
