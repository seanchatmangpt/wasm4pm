/**
 * PCA feature reduction — hyper-optimized native implementation.
 *
 * Performance techniques:
 *   - Columnar Float64Array layout (cache-friendly covariance computation)
 *   - Covariance computed directly without transpose + matmul (single-pass per pair)
 *   - Jacobi eigendecomposition with in-place rotation (no matrix copy per iteration)
 *   - Pre-allocated eigenvector matrix
 *   - Float64Array for centered data
 */

import { buildFeatureMatrix } from './bridge.js';
import type { PCAResult } from './types.js';

// ---------------------------------------------------------------------------
// Columnar layout
// ---------------------------------------------------------------------------

interface Columnar {
  cols: Float64Array[];
  n: number;
  d: number;
}

function toColumnar(data: number[][]): Columnar {
  const n = data.length;
  const d = data[0]?.length ?? 0;
  const cols: Float64Array[] = [];
  for (let j = 0; j < d; j++) {
    const col = new Float64Array(n);
    for (let i = 0; i < n; i++) col[i] = data[i][j];
    cols.push(col);
  }
  return { cols, n, d };
}

// ---------------------------------------------------------------------------
// Min-max normalization (columnar, in-place)
// ---------------------------------------------------------------------------

function minMaxNormalize(col: Columnar): void {
  const { cols, n, d } = col;
  for (let j = 0; j < d; j++) {
    const c = cols[j];
    let min = c[0], max = c[0];
    for (let i = 1; i < n; i++) {
      if (c[i] < min) min = c[i];
      if (c[i] > max) max = c[i];
    }
    const range = max - min;
    if (range === 0) { c.fill(0); continue; }
    const invRange = 1 / range;
    for (let i = 0; i < n; i++) c[i] = (c[i] - min) * invRange;
  }
}

// ---------------------------------------------------------------------------
// Covariance matrix (direct computation, no transpose)
// ---------------------------------------------------------------------------

function covarianceMatrix(col: Columnar): Float64Array[] {
  const { cols, n, d } = col;
  const invN = 1 / (n - 1);

  // Center columns in-place
  const means = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += cols[j][i];
    means[j] = sum / n;
    for (let i = 0; i < n; i++) cols[j][i] -= means[j];
  }

  // Compute covariance directly (symmetric, only upper triangle)
  const cov: Float64Array[] = [];
  for (let j = 0; j < d; j++) {
    cov.push(new Float64Array(d));
  }

  for (let j = 0; j < d; j++) {
    const cj = cols[j];
    cov[j][j] = 0;
    for (let i = 0; i < n; i++) cov[j][j] += cj[i] * cj[i];
    cov[j][j] *= invN;

    for (let k = j + 1; k < d; k++) {
      const ck = cols[k];
      let sum = 0;
      for (let i = 0; i < n; i++) sum += cj[i] * ck[i];
      const val = sum * invN;
      cov[j][k] = val;
      cov[k][j] = val;
    }
  }

  return cov;
}

// ---------------------------------------------------------------------------
// Jacobi eigendecomposition (in-place, pre-allocated)
// ---------------------------------------------------------------------------

function eigenSymmetric(cov: Float64Array[], maxIter = 200): { eigenvalues: Float64Array; eigenvectors: Float64Array[] } {
  const n = cov.length;

  // Work on a copy
  const a: Float64Array[] = [];
  for (let i = 0; i < n; i++) a.push(new Float64Array(cov[i]));

  // Pre-allocated eigenvector matrix (identity)
  const v: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(n);
    row[i] = 1;
    v.push(row);
  }

  for (let iter = 0; iter < maxIter; iter++) {
    // Find largest off-diagonal
    let maxVal = 0;
    let p = 0, q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const av = a[i][j] < 0 ? -a[i][j] : a[i][j];
        if (av > maxVal) { maxVal = av; p = i; q = j; }
      }
    }
    if (maxVal < 1e-10) break;

    // Compute rotation
    let theta: number;
    const diff = a[p][p] - a[q][q];
    if (diff === 0 || (diff < 0 ? -diff : diff) < 1e-10) {
      theta = Math.PI / 4;
    } else {
      theta = 0.5 * Math.atan2(2 * a[p][q], diff);
    }

    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const c2 = c * c;
    const s2 = s * s;
    const cs = c * s;

    // Update matrix elements
    const app = a[p][p], aqq = a[q][q], apq = a[p][q];

    a[p][p] = c2 * app + 2 * cs * apq + s2 * aqq;
    a[q][q] = s2 * app - 2 * cs * apq + c2 * aqq;
    a[p][q] = 0;
    a[q][p] = 0;

    for (let i = 0; i < n; i++) {
      if (i === p || i === q) continue;
      const aip = a[i][p];
      const aiq = a[i][q];
      a[i][p] = c * aip + s * aiq;
      a[p][i] = a[i][p];
      a[i][q] = -s * aip + c * aiq;
      a[q][i] = a[i][q];

      // Update eigenvectors
      const vip = v[i][p];
      const viq = v[i][q];
      v[i][p] = c * vip + s * viq;
      v[i][q] = -s * vip + c * viq;
    }
  }

  // Extract and sort eigenvalues by absolute value (descending)
  const eigenvalues = new Float64Array(n);
  for (let i = 0; i < n; i++) eigenvalues[i] = a[i][i];

  const indices = new Int32Array(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  // Sort indices by |eigenvalue| descending
  indices.sort((a, b) => {
    const va = eigenvalues[a] < 0 ? -eigenvalues[a] : eigenvalues[a];
    const vb = eigenvalues[b] < 0 ? -eigenvalues[b] : eigenvalues[b];
    return vb - va;
  });

  const sortedEigenvalues = new Float64Array(n);
  const sortedEigenvectors: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    sortedEigenvalues[i] = eigenvalues[indices[i]];
    const vec = new Float64Array(n);
    for (let j = 0; j < n; j++) vec[j] = v[j][indices[i]];
    sortedEigenvectors.push(vec);
  }

  return { eigenvalues: sortedEigenvalues, eigenvectors: sortedEigenvectors };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reduce feature dimensionality using PCA.
 */
export async function reduceFeaturesPCA(
  featuresJson: Array<Record<string, unknown>>,
  options: {
    nComponents?: number;
    normalize?: boolean;
  } = {},
): Promise<PCAResult> {
  const matrix = buildFeatureMatrix(featuresJson);

  if (matrix.data.length < 2 || matrix.featureNames.length < 2) {
    throw new Error('Need at least 2 traces and 2 features for PCA');
  }

  const col = toColumnar(matrix.data);
  const { n, d } = col;

  if (options.normalize !== false) minMaxNormalize(col);

  const nComponents = Math.min(options.nComponents ?? 2, d);

  // Covariance (centers data in-place)
  const cov = covarianceMatrix(col);

  // Eigendecomposition
  const { eigenvalues, eigenvectors } = eigenSymmetric(cov);

  // Explained variance
  let totalVariance = 0;
  for (let i = 0; i < eigenvalues.length; i++) totalVariance += eigenvalues[i];
  const invTotal = totalVariance === 0 ? 0 : 1 / totalVariance;

  const explainedVariance: number[] = [];
  for (let i = 0; i < nComponents; i++) explainedVariance.push(eigenvalues[i] * invTotal);

  // Project: centered (already centered by covarianceMatrix) × eigenvectors^T
  // components[i] = i-th eigenvector (length d), stored as Float64Array
  const components: number[][] = [];
  const transformedData: number[][] = [];

  for (let i = 0; i < n; i++) {
    const row = new Array(nComponents);
    for (let c = 0; c < nComponents; c++) {
      const vec = eigenvectors[c]; // c-th eigenvector
      let val = 0;
      for (let j = 0; j < d; j++) val += col.cols[j][i] * vec[j];
      row[c] = val;
    }
    transformedData.push(row);
  }

  for (let c = 0; c < nComponents; c++) {
    components.push(Array.from(eigenvectors[c]));
  }

  return {
    nComponents,
    explainedVariance,
    transformedData,
    components,
    originalFeatureCount: d,
    featureNames: matrix.featureNames,
  };
}
