import { describe, it, expect } from 'vitest';
import { reduceFeaturesPCA } from '../reduction.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

/** 5 points in 4D feature space (perfectly collinear along (1,2,3,4)) */
const collinearFeatures = [
  { case_id: 'c1', f1: 1, f2: 2, f3: 3, f4: 4 },
  { case_id: 'c2', f1: 2, f2: 4, f3: 6, f4: 8 },
  { case_id: 'c3', f1: 1.5, f2: 3, f3: 4.5, f4: 6 },
  { case_id: 'c4', f1: 3, f2: 6, f3: 9, f4: 12 },
  { case_id: 'c5', f1: 2.5, f2: 5, f3: 7.5, f4: 10 },
];

/** 4 independent 2D points */
const independentFeatures = [
  { case_id: 'p1', a: 1, b: 10 },
  { case_id: 'p2', a: 5, b: 2 },
  { case_id: 'p3', a: 9, b: 8 },
  { case_id: 'p4', a: 3, b: 6 },
];

// ─── Structural invariants ────────────────────────────────────────────────────

describe('reduceFeaturesPCA — structural shape', () => {
  it('reduces to 2 components', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });

    expect(result.nComponents).toBe(2);
    expect(result.originalFeatureCount).toBe(4);
    expect(result.transformedData).toHaveLength(5);
    for (const row of result.transformedData) {
      expect(row).toHaveLength(2);
    }
    expect(result.explainedVariance).toHaveLength(2);
    expect(result.components).toHaveLength(2);
    expect(result.featureNames).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  it('reduces to 1 component', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 1 });
    expect(result.nComponents).toBe(1);
    expect(result.transformedData[0]).toHaveLength(1);
  });

  it('output row count equals input row count', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });
    expect(result.transformedData).toHaveLength(collinearFeatures.length);
  });

  it('nComponents in result matches requested value', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 3 });
    expect(result.nComponents).toBe(3);
    for (const row of result.transformedData) {
      expect(row).toHaveLength(3);
    }
  });

  it('components array length equals nComponents', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });
    expect(result.components).toHaveLength(result.nComponents);
  });

  it('each component vector length equals original feature count', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });
    for (const vec of result.components) {
      expect(vec).toHaveLength(result.originalFeatureCount);
    }
  });

  it('featureNames excludes case_id', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 1 });
    expect(result.featureNames).not.toContain('case_id');
  });

  it('output has fewer or equal columns than input features', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });
    expect(result.nComponents).toBeLessThanOrEqual(result.originalFeatureCount);
  });

  it('nComponents is capped at number of input features', async () => {
    // Requesting more components than features → caps at d
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 100 });
    expect(result.nComponents).toBeLessThanOrEqual(4);
  });
});

// ─── Explained variance domain contracts ─────────────────────────────────────

describe('reduceFeaturesPCA — explained variance', () => {
  it('explained variance is bounded [0, 1]', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });
    for (const ev of result.explainedVariance) {
      expect(ev).toBeGreaterThanOrEqual(0);
      expect(ev).toBeLessThanOrEqual(1);
    }
  });

  it('sum of explainedVariance does not exceed 1.0', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });
    const total = result.explainedVariance.reduce((s, v) => s + v, 0);
    expect(total).toBeLessThanOrEqual(1.01);
  });

  it('all explainedVariance values are non-negative', async () => {
    const result = await reduceFeaturesPCA(independentFeatures, { nComponents: 2 });
    for (const ev of result.explainedVariance) {
      expect(ev).toBeGreaterThanOrEqual(0);
    }
  });

  it('perfectly collinear data: first component explains almost all variance', async () => {
    // Data lies on a 1D line → first PC should capture ~100% of variance
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });
    expect(result.explainedVariance[0]).toBeGreaterThan(0.99);
  });

  it('explainedVariance values are finite numbers', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });
    for (const ev of result.explainedVariance) {
      expect(Number.isFinite(ev)).toBe(true);
    }
  });

  it('explainedVariance length matches nComponents', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 3 });
    expect(result.explainedVariance).toHaveLength(result.nComponents);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('reduceFeaturesPCA — error handling', () => {
  it('throws for fewer than 2 traces', async () => {
    await expect(reduceFeaturesPCA([{ case_id: 'c1', f1: 1, f2: 2 }])).rejects.toThrow(
      'Need at least 2 traces and 2 features'
    );
  });

  it('throws for fewer than 2 features', async () => {
    await expect(
      reduceFeaturesPCA([
        { case_id: 'c1', f1: 1 },
        { case_id: 'c2', f1: 2 },
      ])
    ).rejects.toThrow('Need at least 2 traces and 2 features');
  });

  it('throws the exact error message from source', async () => {
    await expect(reduceFeaturesPCA([{ case_id: 'c1', f1: 1 }])).rejects.toThrow(
      'Need at least 2 traces and 2 features'
    );
  });
});

// ─── Normalization behavior ───────────────────────────────────────────────────

describe('reduceFeaturesPCA — normalization', () => {
  it('runs on raw feature scales when normalize=false', async () => {
    const features = [
      { case_id: '1', a: 1, b: 1000 },
      { case_id: '2', a: 2, b: 2000 },
      { case_id: '3', a: 3, b: 3000 },
      { case_id: '4', a: 4, b: 4000 },
    ];
    const result = await reduceFeaturesPCA(features, { nComponents: 2, normalize: false });
    expect(result.nComponents).toBe(2);
    expect(result.components).toHaveLength(2);
    // First component should explain almost all variance (perfectly collinear data).
    expect(result.explainedVariance[0]).toBeGreaterThan(0.99);
  });

  it('normalize=true (default) and normalize=false produce same number of components', async () => {
    const withNorm = await reduceFeaturesPCA(independentFeatures, { nComponents: 2 });
    const withoutNorm = await reduceFeaturesPCA(independentFeatures, {
      nComponents: 2,
      normalize: false,
    });
    expect(withNorm.nComponents).toBe(withoutNorm.nComponents);
    expect(withNorm.transformedData.length).toBe(withoutNorm.transformedData.length);
  });

  it('identity data (all same values) handled without NaN — normalize=true', async () => {
    const features = [
      { case_id: 'c1', f1: 5, f2: 5 },
      { case_id: 'c2', f1: 5, f2: 5 },
      { case_id: 'c3', f1: 5, f2: 5 },
    ];
    // Should not throw; all values in transformedData should be finite
    const result = await reduceFeaturesPCA(features, { nComponents: 1 });
    for (const row of result.transformedData) {
      for (const val of row) {
        expect(Number.isNaN(val)).toBe(false);
      }
    }
  });
});

// ─── nComponents=1 contract ───────────────────────────────────────────────────

describe('reduceFeaturesPCA — nComponents=1', () => {
  it('output is 1D array per row', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 1 });
    expect(result.transformedData[0]).toHaveLength(1);
    expect(result.transformedData[1]).toHaveLength(1);
  });

  it('produces exactly 1 eigenvector component', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 1 });
    expect(result.components).toHaveLength(1);
  });

  it('produces exactly 1 explainedVariance entry', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 1 });
    expect(result.explainedVariance).toHaveLength(1);
  });
});

// ─── Metamorphic: dimensionality reduction is real ────────────────────────────

describe('reduceFeaturesPCA — metamorphic', () => {
  it('output dimensionality is strictly less than input dimensionality when components < features', async () => {
    // 4 features reduced to 2 components
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 2 });
    expect(result.nComponents).toBeLessThan(result.originalFeatureCount);
    for (const row of result.transformedData) {
      expect(row.length).toBeLessThan(result.originalFeatureCount);
    }
  });

  it('all projected values are finite numbers', async () => {
    const result = await reduceFeaturesPCA(independentFeatures, { nComponents: 2 });
    for (const row of result.transformedData) {
      for (const val of row) {
        expect(Number.isFinite(val)).toBe(true);
        expect(Number.isNaN(val)).toBe(false);
      }
    }
  });

  it('originalFeatureCount matches the actual number of numeric columns', async () => {
    const result = await reduceFeaturesPCA(collinearFeatures, { nComponents: 1 });
    // collinearFeatures has 4 numeric feature columns (f1,f2,f3,f4) + case_id (excluded)
    expect(result.originalFeatureCount).toBe(4);
  });
});
