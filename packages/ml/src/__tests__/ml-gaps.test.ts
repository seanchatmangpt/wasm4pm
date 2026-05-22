/**
 * ml-gaps.test.ts
 *
 * Rank 1 (mathematical) and Rank 2 (domain contract) gaps not covered by any
 * existing test file. Each group targets a different ML module and closes a
 * contract that could silently produce wrong results.
 *
 * Gap inventory (confirmed absent from existing 472 tests):
 *
 *   [PCA-R1-1]  Eigenvector orthogonality: dot(v_i, v_j) ≈ 0 for i ≠ j.
 *               Jacobi guarantees this; a broken implementation loses it.
 *
 *   [PCA-R1-2]  Transformed data has zero mean per component column.
 *               PCA centres the data before projecting — output must be centred.
 *
 *   [PCA-R2-1]  explainedVariance sums to 1.0 when all components are requested.
 *               Only partial-component sums are tested; full-component sum is not.
 *
 *   [CLF-R1-1]  caseId ordering: result.predictions[i].caseId === input[i].case_id
 *               for all four classifiers.
 *               Existing tests check the set of caseIds but not positional order.
 *
 *   [CLF-R2-1]  Confidence in [0, 1] for 3-class problems across all methods.
 *               Existing tests only use 2-class datasets for bound checks.
 *
 *   [CLF-R1-2]  Determinism: identical input → identical output for all 4 methods.
 *               Only clustering has an explicit determinism test; classifiers do not.
 *
 *   [REG-R1-1]  predictions[i].actual == y[i] (target field mapping invariant).
 *               The actual field must equal the target value used during fitting.
 *
 *   [BRG-R1-1]  encodeLabels inverseMap is the exact inverse of labelMap.
 *               A broken encode/decode pair silently renames classes.
 *
 *   [BRG-R1-2]  One-hot encoding sums to exactly 1 per string column per row.
 *               If two categories share an encoding slot the classifier is fed garbage.
 *
 *   [CLU-R2-1]  Centroid coordinates are all finite numbers (no NaN / Infinity).
 *               A degenerate centroid silently corrupts subsequent distance computations.
 *
 *   [ANO-R2-1]  peakValues are non-negative when the input series has only non-negative values.
 *               Peak detection reads from the original series; if the input is ≥ 0 so are peaks.
 *
 *   [FORE-R1-1] Forecast horizon values are strictly beyond the last known index.
 *               forecast[0] corresponds to index n, forecast[k] to index n+k — never inside
 *               the training window.
 */

import { describe, it, expect } from 'vitest';
import { buildFeatureMatrix, encodeLabels } from '../bridge.js';
import { classifyTraces, regressRemainingTime } from '../classifiers.js';
import { clusterTraces } from '../clustering.js';
import { detectEnhancedAnomalies } from '../anomaly.js';
import { forecastSeries } from '../forecasting.js';
import { reduceFeaturesPCA } from '../reduction.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

/** 3-class dataset with clearly separable groups (for multi-class tests) */
const THREE_CLASS_FEATURES = [
  { case_id: 'a1', x: 1,   y: 1,   outcome: 'A' },
  { case_id: 'a2', x: 2,   y: 2,   outcome: 'A' },
  { case_id: 'a3', x: 1.5, y: 1.5, outcome: 'A' },
  { case_id: 'b1', x: 50,  y: 50,  outcome: 'B' },
  { case_id: 'b2', x: 51,  y: 51,  outcome: 'B' },
  { case_id: 'b3', x: 52,  y: 52,  outcome: 'B' },
  { case_id: 'c1', x: 100, y: 0,   outcome: 'C' },
  { case_id: 'c2', x: 101, y: 0,   outcome: 'C' },
  { case_id: 'c3', x: 102, y: 0,   outcome: 'C' },
];

/** 4D feature set where all 4 components can be extracted */
const FOUR_D_FEATURES = [
  { case_id: 'p1', f1: 1, f2: 4, f3: 7, f4: 2 },
  { case_id: 'p2', f1: 3, f2: 1, f3: 2, f4: 8 },
  { case_id: 'p3', f1: 6, f2: 9, f3: 1, f4: 5 },
  { case_id: 'p4', f1: 2, f2: 5, f3: 8, f4: 3 },
  { case_id: 'p5', f1: 8, f2: 3, f3: 4, f4: 9 },
  { case_id: 'p6', f1: 4, f2: 7, f3: 6, f4: 1 },
];

/** Simple regression dataset */
const REGRESSION_FEATURES = [
  { case_id: 'r1', x: 1, remaining_time: 10 },
  { case_id: 'r2', x: 2, remaining_time: 20 },
  { case_id: 'r3', x: 3, remaining_time: 30 },
  { case_id: 'r4', x: 4, remaining_time: 40 },
  { case_id: 'r5', x: 5, remaining_time: 50 },
];

// =============================================================================
// [PCA-R1-1] Eigenvector orthogonality
// =============================================================================

describe('[PCA-R1-1] PCA: eigenvectors are mutually orthogonal', () => {
  it('dot product of any two distinct eigenvectors is approximately 0', async () => {
    // Theorem: Jacobi eigendecomposition produces an orthonormal eigenvector set.
    // For a symmetric matrix A, eigenvectors corresponding to distinct eigenvalues
    // are orthogonal by the Spectral Theorem. Any correct Jacobi implementation
    // must preserve this.
    const result = await reduceFeaturesPCA(FOUR_D_FEATURES, { nComponents: 4 });
    const components = result.components; // each is a row vector of length d

    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const vi = components[i];
        const vj = components[j];
        let dot = 0;
        for (let k = 0; k < vi.length; k++) dot += vi[k] * vj[k];
        // Orthogonality: |dot| < 1e-6 (Jacobi converges to tolerance 1e-10)
        expect(Math.abs(dot)).toBeLessThan(1e-6);
      }
    }
  });

  it('each eigenvector has unit norm (orthonormal basis)', async () => {
    // Theorem: Jacobi produces an orthonormal basis.
    // Each eigenvector v must satisfy ||v|| = 1.
    const result = await reduceFeaturesPCA(FOUR_D_FEATURES, { nComponents: 4 });
    for (const vec of result.components) {
      let normSq = 0;
      for (const v of vec) normSq += v * v;
      expect(Math.sqrt(normSq)).toBeCloseTo(1.0, 5);
    }
  });
});

// =============================================================================
// [PCA-R1-2] Transformed data has zero mean per column
// =============================================================================

describe('[PCA-R1-2] PCA: projected data is centred (zero mean per component)', () => {
  it('mean of each transformed column is approximately 0', async () => {
    // Theorem: PCA centres the input data before projecting. The projection of
    // centred data onto any direction produces a zero-mean output.
    // Proof: if X is centred (mean 0 per feature), then for any unit vector v,
    // the projected values X·v have mean (1/n) Σ (xi·v) = (mean(X))·v = 0.
    const result = await reduceFeaturesPCA(FOUR_D_FEATURES, { nComponents: 4, normalize: false });
    const nComponents = result.nComponents;
    const n = result.transformedData.length;

    for (let c = 0; c < nComponents; c++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += result.transformedData[i][c];
      const colMean = sum / n;
      // Mean should be ≈ 0 (tolerance for floating-point accumulation)
      expect(Math.abs(colMean)).toBeLessThan(1e-9);
    }
  });
});

// =============================================================================
// [PCA-R2-1] explainedVariance sums to 1.0 when all d components are requested
// =============================================================================

describe('[PCA-R2-1] PCA: explained variance sums to 1 for full component set', () => {
  it('sum of explainedVariance = 1.0 when nComponents = originalFeatureCount', async () => {
    // Contract: the total variance explained by all components equals 100%.
    // Previous tests only request 2 components from a 4-feature dataset.
    // This gap closes the full-component case.
    const result = await reduceFeaturesPCA(FOUR_D_FEATURES, { nComponents: 4 });
    expect(result.nComponents).toBe(4);
    const total = result.explainedVariance.reduce((s, v) => s + v, 0);
    // Allow ±1e-6 for floating-point Jacobi convergence
    expect(total).toBeGreaterThan(0.999);
    expect(total).toBeLessThanOrEqual(1.0 + 1e-6);
  });

  it('full-component explainedVariance has no negative entries', async () => {
    // Contract: each component explains a non-negative fraction of variance.
    const result = await reduceFeaturesPCA(FOUR_D_FEATURES, { nComponents: 4 });
    for (const ev of result.explainedVariance) {
      expect(ev).toBeGreaterThanOrEqual(0);
    }
  });
});

// =============================================================================
// [CLF-R1-1] caseId positional ordering in predictions
// =============================================================================

describe('[CLF-R1-1] classifyTraces: caseId positional ordering preserved', () => {
  const features = THREE_CLASS_FEATURES;

  for (const method of ['knn', 'logistic_regression', 'decision_tree', 'naive_bayes'] as const) {
    it(`${method}: predictions[i].caseId === input[i].case_id for all i`, async () => {
      // Contract: the i-th prediction must correspond to the i-th input feature object.
      // If the classifier reorders rows internally, the output must still be aligned
      // with the original input order. This invariant is relied on by all callers
      // that zip predictions with other per-trace data.
      const result = await classifyTraces(features, { method });
      expect(result.predictions).toHaveLength(features.length);
      for (let i = 0; i < features.length; i++) {
        expect(result.predictions[i].caseId).toBe(features[i].case_id);
      }
    });
  }
});

// =============================================================================
// [CLF-R2-1] Confidence in [0, 1] for 3-class problems
// =============================================================================

describe('[CLF-R2-1] classifyTraces: confidence in [0,1] for 3-class datasets', () => {
  for (const method of ['knn', 'logistic_regression', 'decision_tree', 'naive_bayes'] as const) {
    it(`${method}: confidence ∈ [0,1] for all predictions on 3-class data`, async () => {
      // Contract: confidence is a probability estimate. It must be in [0, 1]
      // regardless of the number of classes.
      // Existing tests only check this on binary (2-class) datasets.
      const result = await classifyTraces(THREE_CLASS_FEATURES, { method });
      expect(result.predictions.length).toBeGreaterThan(0);
      for (const p of result.predictions) {
        expect(p.confidence).toBeGreaterThanOrEqual(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
        expect(Number.isFinite(p.confidence)).toBe(true);
      }
    });
  }
});

// =============================================================================
// [CLF-R1-2] Determinism for all 4 classifiers
// =============================================================================

describe('[CLF-R1-2] classifyTraces: identical input → identical output (determinism)', () => {
  const features = THREE_CLASS_FEATURES;

  for (const method of ['knn', 'logistic_regression', 'decision_tree', 'naive_bayes'] as const) {
    it(`${method}: two consecutive calls produce bit-identical predictions`, async () => {
      // Contract: all four classifiers are deterministic — no random initialisation
      // without a stable seed, no non-deterministic algorithm. Callers rely on
      // reproducibility for debugging and regression testing.
      const r1 = await classifyTraces(features, { method });
      const r2 = await classifyTraces(features, { method });
      expect(r1.predictions.map((p) => p.predicted)).toEqual(
        r2.predictions.map((p) => p.predicted)
      );
      expect(r1.predictions.map((p) => p.confidence)).toEqual(
        r2.predictions.map((p) => p.confidence)
      );
    });
  }
});

// =============================================================================
// [REG-R1-1] predictions[i].actual equals the target value for row i
// =============================================================================

describe('[REG-R1-1] regressRemainingTime: predictions[i].actual = y[i] (field mapping)', () => {
  it('linear_regression: actual field matches the remaining_time target for each trace', async () => {
    // Theorem: buildFeatureMatrix extracts the target column into matrix.targets.
    // regressRemainingTime then uses y = matrix.targets as the ground truth.
    // predictions[i].actual must equal y[i] exactly — if it does not, the caller
    // cannot compute residuals or verify conformance.
    const result = await regressRemainingTime(REGRESSION_FEATURES, { method: 'linear_regression' });
    for (let i = 0; i < REGRESSION_FEATURES.length; i++) {
      expect(result.predictions[i].actual).toBe(REGRESSION_FEATURES[i].remaining_time);
    }
  });

  it('polynomial_regression: actual field matches the remaining_time target', async () => {
    const result = await regressRemainingTime(REGRESSION_FEATURES, {
      method: 'polynomial_regression',
      degree: 2,
    });
    for (let i = 0; i < REGRESSION_FEATURES.length; i++) {
      expect(result.predictions[i].actual).toBe(REGRESSION_FEATURES[i].remaining_time);
    }
  });

  it('exponential_regression: actual field matches the remaining_time target', async () => {
    const positiveFeatures = REGRESSION_FEATURES.map((f) => ({ ...f, remaining_time: Math.exp(f.x * 0.5) }));
    const result = await regressRemainingTime(positiveFeatures, {
      method: 'exponential_regression',
    });
    for (let i = 0; i < positiveFeatures.length; i++) {
      expect(result.predictions[i].actual).toBeCloseTo(positiveFeatures[i].remaining_time, 10);
    }
  });
});

// =============================================================================
// [BRG-R1-1] encodeLabels inverseMap is the exact inverse of labelMap
// =============================================================================

describe('[BRG-R1-1] encodeLabels: inverseMap is the exact inverse of labelMap', () => {
  it('labelMap.get(label) → n → reverseMap.get(n) === label for all labels', () => {
    // Theorem: labelMap and reverseMap are inverse bijections.
    // If reverseMap is not the inverse of labelMap, classifiers will report
    // wrong class names without any runtime error.
    const labels = ['Approve', 'Reject', 'Pending', 'Approve', 'Reject'];
    const { labelMap, reverseMap } = encodeLabels(labels);

    for (const [label, code] of labelMap) {
      expect(reverseMap.get(code)).toBe(label);
    }
    for (const [code, label] of reverseMap) {
      expect(labelMap.get(label)).toBe(code);
    }
  });

  it('encoded values are in [0, uniqueCount-1]', () => {
    // Theorem: labels are mapped to consecutive integers starting from 0.
    // A gap or duplicate would shift classifier outputs silently.
    const labels = ['X', 'Y', 'Z', 'X', 'Y'];
    const { encoded, labelMap } = encodeLabels(labels);
    const uniqueCount = labelMap.size;
    for (const code of encoded) {
      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThan(uniqueCount);
    }
  });

  it('encoded length equals input labels length', () => {
    // Theorem: encodeLabels is a map — output has one code per input label.
    const labels = ['a', 'b', 'a', 'c', 'b', 'a'];
    const { encoded } = encodeLabels(labels);
    expect(encoded).toHaveLength(labels.length);
  });
});

// =============================================================================
// [BRG-R1-2] One-hot encoding: exactly one 1 per string column per row
// =============================================================================

describe('[BRG-R1-2] buildFeatureMatrix: one-hot columns sum to 1 per string column per row', () => {
  it('one string column with 3 distinct values: sum of hot bits per row = 1', () => {
    // Theorem: for a categorical column with k values, the one-hot encoding
    // produces k binary columns. Exactly one is 1 for each row (the matching
    // category). If two bits are 1, or zero bits are 1, a classifier receives
    // corrupted input with no observable error at the call site.
    const rows = [
      { case_id: 'c1', status: 'open',   x: 1 },
      { case_id: 'c2', status: 'closed', x: 2 },
      { case_id: 'c3', status: 'pending', x: 3 },
      { case_id: 'c4', status: 'open',   x: 4 },
    ];
    const matrix = buildFeatureMatrix(rows);
    // Identify one-hot columns: featureNames that start with 'status='
    const statusIdxs = matrix.featureNames
      .map((n, i) => (n.startsWith('status=') ? i : -1))
      .filter((i) => i >= 0);

    expect(statusIdxs.length).toBe(3); // 3 distinct values
    for (let rowIdx = 0; rowIdx < matrix.data.length; rowIdx++) {
      const hotBits = statusIdxs.filter((col) => matrix.data[rowIdx][col] === 1).length;
      expect(hotBits).toBe(1); // exactly one active bit
    }
  });

  it('one-hot values are binary (0 or 1 only)', () => {
    // Theorem: one-hot encoding maps string values to {0, 1}. Any other value
    // corrupts distance computations in kNN and clustering.
    const rows = [
      { case_id: 'c1', kind: 'alpha', v: 1 },
      { case_id: 'c2', kind: 'beta',  v: 2 },
      { case_id: 'c3', kind: 'alpha', v: 3 },
    ];
    const matrix = buildFeatureMatrix(rows);
    const hotIdxs = matrix.featureNames
      .map((n, i) => (n.startsWith('kind=') ? i : -1))
      .filter((i) => i >= 0);

    for (const rowData of matrix.data) {
      for (const col of hotIdxs) {
        expect(rowData[col] === 0 || rowData[col] === 1).toBe(true);
      }
    }
  });
});

// =============================================================================
// [CLU-R2-1] Centroid coordinates are all finite numbers
// =============================================================================

describe('[CLU-R2-1] clusterTraces (kmeans): centroid values are all finite', () => {
  it('no centroid coordinate is NaN or Infinity for normally distributed data', async () => {
    // Contract: a NaN centroid silently poisons every subsequent distance
    // computation, making all assignments to that cluster equally arbitrary.
    const features = [
      { case_id: 'c1', x: 1.5, y: 2.3, z: 0.7 },
      { case_id: 'c2', x: 8.1, y: 9.2, z: 7.6 },
      { case_id: 'c3', x: 1.2, y: 2.1, z: 0.9 },
      { case_id: 'c4', x: 8.4, y: 9.5, z: 7.8 },
      { case_id: 'c5', x: 4.0, y: 5.0, z: 3.5 },
      { case_id: 'c6', x: 4.2, y: 5.3, z: 3.7 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 3 });
    expect(result.centroids).toBeDefined();
    for (const centroid of result.centroids!) {
      for (const coord of centroid) {
        expect(Number.isFinite(coord)).toBe(true);
        expect(Number.isNaN(coord)).toBe(false);
      }
    }
  });

  it('no centroid coordinate is NaN or Infinity for identical input points (degenerate)', async () => {
    // Edge case: k-means++ init guard kicks in when all distances are 0.
    // The fallback path must still produce finite centroid coordinates.
    const features = Array.from({ length: 6 }, (_, i) => ({
      case_id: `c${i + 1}`,
      x: 5.0,
      y: 5.0,
    }));
    const result = await clusterTraces(features, { method: 'kmeans', k: 3 });
    expect(result.centroids).toBeDefined();
    for (const centroid of result.centroids!) {
      for (const coord of centroid) {
        expect(Number.isFinite(coord)).toBe(true);
        expect(Number.isNaN(coord)).toBe(false);
      }
    }
  });
});

// =============================================================================
// [ANO-R2-1] peakValues are non-negative for non-negative input series
// =============================================================================

describe('[ANO-R2-1] detectEnhancedAnomalies: peakValues >= 0 for non-negative series', () => {
  it('all peakValues are non-negative when input contains only non-negative values', async () => {
    // Contract: peak detection reads directly from the original series.
    // If the series contains only non-negative values (drift distances are
    // always >= 0), every peakValue must also be >= 0.
    // A negative peakValue would indicate a read from the wrong array.
    const series = [0.1, 0.3, 0.1, 0.8, 0.1, 0.5, 0.1, 0.9, 0.1, 0.2, 0.1];
    const result = await detectEnhancedAnomalies(series);
    for (const v of result.peakValues) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('peakValues are all strictly positive when input is strictly positive', async () => {
    // Stronger bound: positive series → positive peaks.
    const series = [0.01, 1.0, 0.01, 2.0, 0.01, 3.0, 0.01];
    const result = await detectEnhancedAnomalies(series);
    for (const v of result.peakValues) {
      expect(v).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// [FORE-R1-1] Forecast horizon values correspond to indices beyond n-1
// =============================================================================

describe('[FORE-R1-1] forecastSeries: forecast values correspond to extrapolated positions', () => {
  it('for a perfectly linear series, forecast[k] ≈ slope * (n + k) + intercept', async () => {
    // Theorem: trendForecastCore sets forecast[i] = slope * (n + i) + intercept.
    // For a linear series y = 2i + 1 (slope=2, intercept=1), the forecast at
    // position n is 2n + 1. This verifies the implementation places the forecast
    // window correctly beyond the training data.
    const slope = 2;
    const intercept = 1;
    const n = 10;
    const series = Array.from({ length: n }, (_, i) => slope * i + intercept);

    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.forecast).toBeDefined();
    expect(result.forecast!).toHaveLength(3);

    for (let k = 0; k < 3; k++) {
      // Expected value at extrapolated position n + k
      const expected = slope * (n + k) + intercept;
      expect(result.forecast![k]).toBeCloseTo(expected, 4);
    }
  });

  it('forecast values are strictly greater than the mean of a strictly increasing series', async () => {
    // Domain contract: a series with positive slope should produce forecast
    // values that exceed the historical mean (we are predicting future values
    // that continue the upward trend).
    const series = Array.from({ length: 8 }, (_, i) => i + 1); // 1,2,...,8
    const historicalMean = series.reduce((s, v) => s + v, 0) / series.length; // = 4.5

    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.forecast).toBeDefined();
    for (const v of result.forecast!) {
      expect(v).toBeGreaterThan(historicalMean);
    }
  });

  it('forecast[k] > forecast[k-1] for a strictly increasing series (trend continuation)', async () => {
    // Contract: if the fitted slope is positive, successive forecast values must
    // also be strictly increasing. forecast[k] = slope*(n+k)+b is strictly
    // increasing in k iff slope > 0.
    const series = Array.from({ length: 8 }, (_, i) => i * 3 + 5);

    const result = await forecastSeries(series, { forecastPeriods: 4 });
    expect(result.forecast).toBeDefined();
    for (let k = 1; k < result.forecast!.length; k++) {
      expect(result.forecast![k]).toBeGreaterThan(result.forecast![k - 1]);
    }
  });
});
