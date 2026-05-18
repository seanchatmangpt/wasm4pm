/**
 * Encoding Gaps Audit: Critical Feature Encoding Issues
 *
 * Identifies 5 encoding gaps in buildFeatureMatrix and encodeLabels:
 * Gap 1: Extreme Outliers (NaN in numeric columns)
 * Gap 2: Missing Columns in Partial Rows (sparse data)
 * Gap 3: Categorical Column Ordering Instability
 * Gap 4: Target Coercion Inconsistency (NaN/Inf in targets)
 * Gap 5: Zero-Variance One-Hot Encoding
 */

import { describe, it, expect } from 'vitest';
import { buildFeatureMatrix, encodeLabels } from '../bridge.js';

// ─── GAP 1: Extreme Outliers (NaN/Inf/Negative Inf) ──────────────────────────

describe('ENCODING GAP 1: Extreme Outliers in Numeric Columns', () => {
  it('handles NaN in numeric column (should coerce to 0, not cascade NaN)', () => {
    const features = [
      { case_id: 'c1', value: 10, other: 100 },
      { case_id: 'c2', value: NaN, other: 200 },
      { case_id: 'c3', value: 30, other: 300 },
    ];
    const result = buildFeatureMatrix(features);
    expect(result.data[1][0]).toBe(0); // NaN → 0
    expect(result.data).toHaveLength(3);
    expect(result.data[0][1]).toBe(100); // other column unaffected
  });

  it('handles Infinity in numeric column (should coerce to 0)', () => {
    const features = [
      { case_id: 'c1', value: 10 },
      { case_id: 'c2', value: Infinity },
      { case_id: 'c3', value: 30 },
    ];
    const result = buildFeatureMatrix(features);
    expect(result.data[1][0]).toBe(0); // Inf → 0
    expect(Number.isFinite(result.data[1][0])).toBe(true);
  });

  it('handles negative Infinity in numeric column', () => {
    const features = [
      { case_id: 'c1', value: 10 },
      { case_id: 'c2', value: -Infinity },
      { case_id: 'c3', value: 30 },
    ];
    const result = buildFeatureMatrix(features);
    expect(result.data[1][0]).toBe(0); // -Inf → 0
    expect(Number.isFinite(result.data[1][0])).toBe(true);
  });

  it('cascade detection: mixed NaN/Inf in same column should not propagate', () => {
    const features = [
      { case_id: 'c1', val: 10, target: 100 },
      { case_id: 'c2', val: NaN, target: NaN },
      { case_id: 'c3', val: Infinity, target: 200 },
      { case_id: 'c4', val: -Infinity, target: 300 },
    ];
    const result = buildFeatureMatrix(features, 'target');
    // All non-finite values should be 0, not propagate
    expect(result.data[1][0]).toBe(0);
    expect(result.data[2][0]).toBe(0);
    expect(result.data[3][0]).toBe(0);
    // Targets: NaN → 0, others preserved
    expect(result.targets[1]).toBe(0);
    expect(result.targets[2]).toBe(200);
  });

  it('ensures all output data is finite after coercion', () => {
    const features = [
      { case_id: 'c1', a: 10, b: NaN, c: Infinity },
      { case_id: 'c2', a: 20, b: 30, c: -Infinity },
    ];
    const result = buildFeatureMatrix(features);
    for (const row of result.data) {
      for (const val of row) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });
});

// ─── GAP 2: Missing Columns in Partial Rows ──────────────────────────────────

describe('ENCODING GAP 2: Missing Properties in Sparse/Partial Rows', () => {
  it('handles rows with missing properties (sparse data)', () => {
    const features = [
      { case_id: 'c1', x: 1, y: 2, z: 3 },
      { case_id: 'c2', x: 10 }, // missing y, z
      { case_id: 'c3', y: 20, z: 30 }, // missing x
    ];
    const result = buildFeatureMatrix(features);
    // All rows must have same column count
    expect(result.data[0].length).toBe(result.data[1].length);
    expect(result.data[1].length).toBe(result.data[2].length);
    // Missing columns coerce to 0
    expect(result.data[1][result.featureNames.indexOf('y')]).toBe(0);
  });

  it('row with all missing numeric columns defaults to all zeros', () => {
    const features = [
      { case_id: 'c1', x: 5, y: 10 },
      { case_id: 'c2', x: 20 }, // missing y
      { case_id: 'c3', y: 30 }, // missing x
    ];
    const result = buildFeatureMatrix(features);
    // c2 missing y → 0; c3 missing x → 0
    const yIdx = result.featureNames.indexOf('y');
    const xIdx = result.featureNames.indexOf('x');
    expect(result.data[1][yIdx]).toBe(0);
    expect(result.data[2][xIdx]).toBe(0);
  });

  it('categorical column missing in some rows creates empty string encoding', () => {
    const features = [
      { case_id: 'c1', cat: 'A' },
      { case_id: 'c2' }, // cat missing
      { case_id: 'c3', cat: 'B' },
    ];
    const result = buildFeatureMatrix(features);
    // Empty string should be one-hot encoded as '' category
    expect(result.featureNames).toContain('cat=');
    expect(result.featureNames).toContain('cat=A');
    expect(result.featureNames).toContain('cat=B');
  });
});

// ─── GAP 3: Categorical Column Ordering Instability ─────────────────────────

describe('ENCODING GAP 3: Categorical Column Ordering Stability', () => {
  it('one-hot encoding is deterministic regardless of input order', () => {
    const features1 = [
      { case_id: 'c1', cat: 'A' },
      { case_id: 'c2', cat: 'B' },
      { case_id: 'c3', cat: 'C' },
    ];
    const features2 = [
      { case_id: 'c3', cat: 'C' },
      { case_id: 'c1', cat: 'A' },
      { case_id: 'c2', cat: 'B' },
    ];
    const result1 = buildFeatureMatrix(features1);
    const result2 = buildFeatureMatrix(features2);

    // Feature names should be identical (sorted alphabetically)
    expect(result1.featureNames).toEqual(result2.featureNames);

    // Column indices should be stable
    const aIdx1 = result1.featureNames.indexOf('cat=A');
    const aIdx2 = result2.featureNames.indexOf('cat=A');
    expect(aIdx1).toBe(aIdx2);
  });

  it('multiple categorical columns maintain consistent ordering', () => {
    const features = [
      { case_id: 'c1', cat1: 'X', cat2: 'P' },
      { case_id: 'c2', cat1: 'Y', cat2: 'Q' },
    ];
    const result1 = buildFeatureMatrix(features);

    // Reprocess and verify feature names are same
    const result2 = buildFeatureMatrix([
      { case_id: 'c2', cat1: 'Y', cat2: 'Q' },
      { case_id: 'c1', cat1: 'X', cat2: 'P' },
    ]);

    expect(result1.featureNames).toEqual(result2.featureNames);
  });

  it('new categories in different rows are collected consistently', () => {
    const features = [
      { case_id: 'c1', color: 'red' },
      { case_id: 'c2', color: 'blue' },
      { case_id: 'c3', color: 'green' },
    ];
    const result = buildFeatureMatrix(features);

    // All three colors should be one-hot columns, sorted
    expect(result.featureNames).toContain('color=blue');
    expect(result.featureNames).toContain('color=green');
    expect(result.featureNames).toContain('color=red');
  });
});

// ─── GAP 4: Target Coercion Inconsistency ────────────────────────────────────

describe('ENCODING GAP 4: Target Coercion Handling (Numeric Targets)', () => {
  it('numeric target handles NaN consistently (coerces to 0)', () => {
    const features = [
      { case_id: 'c1', x: 1, target: 100 },
      { case_id: 'c2', x: 2, target: NaN },
      { case_id: 'c3', x: 3, target: 300 },
    ];
    const result = buildFeatureMatrix(features, 'target');
    expect(result.targets).toEqual([100, 0, 300]);
  });

  it('numeric target handles Infinity (coerces to 0)', () => {
    const features = [
      { case_id: 'c1', x: 1, target: 100 },
      { case_id: 'c2', x: 2, target: Infinity },
      { case_id: 'c3', x: 3, target: 300 },
    ];
    const result = buildFeatureMatrix(features, 'target');
    expect(result.targets[1]).toBe(0);
  });

  it('numeric target handles null/undefined (coerces to 0)', () => {
    const features = [
      { case_id: 'c1', x: 1, target: 100 },
      { case_id: 'c2', x: 2, target: null },
      { case_id: 'c3', x: 3, target: undefined },
      { case_id: 'c4', x: 4, target: 400 },
    ];
    const result = buildFeatureMatrix(features, 'target');
    expect(result.targets).toEqual([100, 0, 0, 400]);
  });

  it('categorical target preserves string labels exactly', () => {
    const features = [
      { case_id: 'c1', x: 1, outcome: 'Approved' },
      { case_id: 'c2', x: 2, outcome: 'Rejected' },
      { case_id: 'c3', x: 3, outcome: 'Pending' },
    ];
    const result = buildFeatureMatrix(features, undefined, 'outcome');
    expect(result.labels).toEqual(['Approved', 'Rejected', 'Pending']);
  });

  it('categorical target handles null (empty string coercion)', () => {
    const features = [
      { case_id: 'c1', x: 1, outcome: 'A' },
      { case_id: 'c2', x: 2, outcome: null },
      { case_id: 'c3', x: 3, outcome: 'B' },
    ];
    const result = buildFeatureMatrix(features, undefined, 'outcome');
    expect(result.labels).toEqual(['A', '', 'B']);
  });
});

// ─── GAP 5: Zero-Variance One-Hot Encoding ───────────────────────────────────

describe('ENCODING GAP 5: Zero-Variance One-Hot Columns', () => {
  it('all-same categorical column produces one-hot with single column', () => {
    const features = [
      { case_id: 'c1', status: 'Active' },
      { case_id: 'c2', status: 'Active' },
      { case_id: 'c3', status: 'Active' },
    ];
    const result = buildFeatureMatrix(features);
    // Exactly one one-hot column since only 'Active' value
    const statusColumns = result.featureNames.filter((f) => f.startsWith('status='));
    expect(statusColumns).toHaveLength(1);
    expect(statusColumns[0]).toBe('status=Active');

    // All rows have 1 for that column (zero variance in one-hot sense)
    for (const row of result.data) {
      expect(row[result.featureNames.indexOf('status=Active')]).toBe(1);
    }
  });

  it('one-hot column with single True category and rest False is zero-variance', () => {
    const features = [
      { case_id: 'c1', flag: 'yes' },
      { case_id: 'c2', flag: 'yes' },
      { case_id: 'c3', flag: 'yes' },
    ];
    const result = buildFeatureMatrix(features);
    // After one-hot encoding, this column has zero variance
    // This is expected behavior (feature selection should filter it later)
    const flagCols = result.featureNames.filter((f) => f.startsWith('flag='));
    expect(flagCols).toHaveLength(1);
  });

  it('mixed categorical values ensure variance in one-hot encoding', () => {
    const features = [
      { case_id: 'c1', category: 'A' },
      { case_id: 'c2', category: 'B' },
      { case_id: 'c3', category: 'A' },
    ];
    const result = buildFeatureMatrix(features);
    // Two one-hot columns, each has variance (not all same value)
    const catCols = result.featureNames.filter((f) => f.startsWith('category='));
    expect(catCols).toHaveLength(2);
  });
});

// ─── BONUS: encodeLabels Edge Cases ──────────────────────────────────────────

describe('encodeLabels: Edge Cases and Stability', () => {
  it('encodes unknown label gracefully (never happens in practice, but contract is != undefined)', () => {
    const labels = ['A', 'B', 'C'];
    const result = encodeLabels(labels);
    // All labels must be in the map
    for (const label of labels) {
      expect(result.labelMap.has(label)).toBe(true);
    }
  });

  it('encoding is stable across multiple calls', () => {
    const labels1 = encodeLabels(['X', 'Y', 'Z']);
    const labels2 = encodeLabels(['X', 'Y', 'Z']);
    expect(labels1.encoded).toEqual(labels2.encoded);
    expect(labels1.labelMap.get('X')).toEqual(labels2.labelMap.get('X'));
  });

  it('empty label string is valid and distinct', () => {
    const result = encodeLabels(['', 'A', '']);
    // Empty string should be one unique label
    expect(result.labelMap.get('')).toBeDefined();
    expect(result.encoded[0]).toBe(result.encoded[2]); // Both empty strings
    expect(result.encoded[0]).not.toBe(result.encoded[1]); // Distinct from 'A'
  });
});

// No integration tests for normalizeFeatures in this audit
// (separate testing in normalization.test.ts)
