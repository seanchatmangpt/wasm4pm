/**
 * Classification and regression — hyper-optimized native implementations.
 *
 * Performance techniques (mirroring wasm4pm Rust patterns):
 *   - Columnar Float64Array layout (cache-friendly, zero GC pressure in hot loops)
 *   - Pre-allocated arrays (no .push() in inner loops)
 *   - Squared-distance (avoid sqrt until output boundary)
 *   - Single-pass mean/variance aggregation
 *   - Early termination in tree split search
 *   - Log-sum-exp numerically stable softmax
 */

import { buildFeatureMatrix, encodeLabels } from './bridge.js';
import type {
  ClassificationMethod,
  ClassificationResult,
  RegressionMethod,
  RegressionResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Columnar layout: number[][] → Float64Array columns (zero-copy read)
// ---------------------------------------------------------------------------

interface ColumnarMatrix {
  data: number[][];
  cols: Float64Array[];  // cols[j] = column j values
  n: number;
  d: number;
}

function toColumnar(data: number[][]): ColumnarMatrix {
  const n = data.length;
  const d = data[0]?.length ?? 0;
  const cols: Float64Array[] = [];
  for (let j = 0; j < d; j++) {
    const col = new Float64Array(n);
    for (let i = 0; i < n; i++) col[i] = data[i][j];
    cols.push(col);
  }
  return { data, cols, n, d };
}

// ---------------------------------------------------------------------------
// Metrics (single-pass)
// ---------------------------------------------------------------------------

function rmse(actual: number[], predicted: number[]): number {
  const n = actual.length;
  if (n === 0) return 0;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = actual[i] - predicted[i];
    ss += d * d;
  }
  return Math.sqrt(ss / n);
}

function mae(actual: number[], predicted: number[]): number {
  const n = actual.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += actual[i] - predicted[i] < 0 ? predicted[i] - actual[i] : actual[i] - predicted[i];
  return sum / n;
}

function rSquared(actual: number[], predicted: number[]): number {
  const n = actual.length;
  if (n === 0) return 1;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += actual[i];
  mean /= n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const rd = actual[i] - predicted[i];
    ssRes += rd * rd;
    const td = actual[i] - mean;
    ssTot += td * td;
  }
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
}

// ---------------------------------------------------------------------------
// k-NN (squared-distance, pre-allocated sort buffer)
// ---------------------------------------------------------------------------

function knnBatch(
  col: ColumnarMatrix,
  labels: number[],
  k: number,
): { label: number; confidence: number }[] {
  const { cols, n, d } = col;
  // Pre-allocate distance buffer (reused across queries)
  const distBuf = new Float64Array(n);
  const results = new Array<{ label: number; confidence: number }>(n);

  for (let qi = 0; qi < n; qi++) {
    // Compute squared distances (no sqrt)
    for (let i = 0; i < n; i++) {
      let ss = 0;
      for (let j = 0; j < d; j++) {
        const diff = cols[j][i] - cols[j][qi];
        ss += diff * diff;
      }
      distBuf[i] = ss;
    }

    // Partial sort: find top-k by squared distance
    // For small k relative to n, insertion into sorted array is fine
    const sorted = new Array<number>(k);
    sorted[0] = 0;
    let sortedLen = 1;
    for (let i = 1; i < n && sortedLen < k; i++) {
      // Insert into sorted position
      let pos = sortedLen;
      while (pos > 0 && distBuf[i] < distBuf[sorted[pos - 1]]) pos--;
      // Shift right
      for (let s = sortedLen; s > pos; s--) sorted[s] = sorted[s - 1];
      sorted[pos] = i;
      sortedLen++;
    }
    // If n < k, fill remaining
    if (n < k) {
      for (let i = sortedLen; i < n; i++) sorted[sortedLen++] = i;
    } else {
      // Replace worst neighbor with better ones from remaining
      for (let i = k; i < n; i++) {
        if (distBuf[i] < distBuf[sorted[k - 1]]) {
          // Remove worst, insert new
          let pos = k - 1;
          while (pos > 0 && distBuf[i] < distBuf[sorted[pos - 1]]) pos--;
          for (let s = k - 1; s > pos; s--) sorted[s] = sorted[s - 1];
          sorted[pos] = i;
        }
      }
    }

    // Weighted vote (inverse distance)
    let bestLabel = labels[sorted[0]];
    let bestWeight = 0;
    let totalWeight = 0;
    const votes = new Map<number, number>();
    for (let ni = 0; ni < sortedLen; ni++) {
      const idx = sorted[ni];
      const w = 1 / (Math.sqrt(distBuf[idx]) + 1e-10);
      totalWeight += w;
      const vw = (votes.get(labels[idx]) ?? 0) + w;
      votes.set(labels[idx], vw);
      if (vw > bestWeight) {
        bestWeight = vw;
        bestLabel = labels[idx];
      }
    }

    results[qi] = { label: bestLabel, confidence: bestWeight / totalWeight };
  }

  return results;
}

// ---------------------------------------------------------------------------
// Naive Bayes (Gaussian, single-pass mean+variance)
// ---------------------------------------------------------------------------

interface NBModel {
  classLogPriors: Float64Array;
  classMeans: Float64Array[];   // per-class per-feature
  classInvVars: Float64Array[];  // 1/(2*variance) for log-likelihood
  logDet: Float64Array[];        // log(2*pi*variance) per class
  classes: number[];
  nFeatures: number;
  nClasses: number;
}

function gaussianNBTrain(data: number[][], labels: number[]): NBModel {
  const n = data.length;
  const d = data[0]?.length ?? 0;
  const classes = [...new Set(labels)];

  // Build class index
  const classIdx = new Map<number, number>();
  for (let ci = 0; ci < classes.length; ci++) classIdx.set(classes[ci], ci);
  const nClasses = classes.length;

  // Single-pass: count, sum, sum-sq per class per feature
  const counts = new Float64Array(nClasses);
  const sums = Array.from({ length: nClasses }, () => new Float64Array(d));
  const sumSq = Array.from({ length: nClasses }, () => new Float64Array(d));

  for (let i = 0; i < n; i++) {
    const ci = classIdx.get(labels[i])!;
    counts[ci]++;
    for (let j = 0; j < d; j++) {
      sums[ci][j] += data[i][j];
      sumSq[ci][j] += data[i][j] * data[i][j];
    }
  }

  const classLogPriors = new Float64Array(nClasses);
  const classMeans = sums;  // reuse, will divide below
  const classInvVars = Array.from({ length: nClasses }, () => new Float64Array(d));
  const logDet = Array.from({ length: nClasses }, () => new Float64Array(d));

  const LN2PI = Math.log(2 * Math.PI);

  for (let ci = 0; ci < nClasses; ci++) {
    const cnt = counts[ci];
    classLogPriors[ci] = Math.log(cnt / n);
    for (let j = 0; j < d; j++) {
      const m = sums[ci][j] / cnt;
      classMeans[ci][j] = m;
      const variance = sumSq[ci][j] / cnt - m * m + 1e-9;
      classInvVars[ci][j] = 1 / (2 * variance);
      logDet[ci][j] = LN2PI + Math.log(variance);
    }
  }

  return { classLogPriors, classMeans, classInvVars, logDet, classes, nFeatures: d, nClasses };
}

function gaussianNBPredictBatch(
  model: NBModel,
  data: number[][],
): { label: number; confidence: number }[] {
  const n = data.length;
  const { classLogPriors, classMeans, classInvVars, logDet, nFeatures, nClasses } = model;
  const results = new Array<{ label: number; confidence: number }>(n);
  const logProbs = new Float64Array(nClasses);

  for (let i = 0; i < n; i++) {
    let bestClass = 0;
    let bestLog = -Infinity;

    for (let ci = 0; ci < nClasses; ci++) {
      let lp = classLogPriors[ci];
      for (let j = 0; j < nFeatures; j++) {
        const diff = data[i][j] - classMeans[ci][j];
        lp -= 0.5 * logDet[ci][j] + diff * diff * classInvVars[ci][j];
      }
      logProbs[ci] = lp;
      if (lp > bestLog) {
        bestLog = lp;
        bestClass = ci;
      }
    }

    // Log-sum-exp for stable softmax
    let maxLp = logProbs[0];
    for (let ci = 1; ci < nClasses; ci++) {
      if (logProbs[ci] > maxLp) maxLp = logProbs[ci];
    }
    let expSum = 0;
    for (let ci = 0; ci < nClasses; ci++) expSum += Math.exp(logProbs[ci] - maxLp);
    results[i] = { label: model.classes[bestClass], confidence: Math.exp(bestLog - maxLp) / expSum };
  }

  return results;
}

// ---------------------------------------------------------------------------
// Logistic Regression (multi-class OvA, vectorized gradient)
// ---------------------------------------------------------------------------

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function logisticRegressionTrain(
  data: number[][],
  labels: number[],
  maxIter = 100,
  lr = 0.01,
): { weights: number[][]; nClasses: number; iterations: number } {
  const classes = [...new Set(labels)].sort((a, b) => a - b);
  const n = data.length;
  const d = data[0]?.length ?? 0;
  const weights: number[][] = [];

  for (const c of classes) {
    const w = new Float64Array(d + 1); // bias at index 0
    const grad = new Float64Array(d + 1);

    for (let iter = 0; iter < maxIter; iter++) {
      grad.fill(0);

      for (let i = 0; i < n; i++) {
        let z = w[0];
        for (let j = 0; j < d; j++) z += data[i][j] * w[j + 1];
        const err = sigmoid(z) - (labels[i] === c ? 1 : 0);
        grad[0] += err;
        for (let j = 0; j < d; j++) grad[j + 1] += err * data[i][j];
      }

      const invN = lr / n;
      for (let j = 0; j <= d; j++) w[j] -= invN * grad[j];
    }

    weights.push(Array.from(w));
  }

  return { weights, nClasses: classes.length, iterations: maxIter };
}

function logisticRegressionPredictBatch(
  model: ReturnType<typeof logisticRegressionTrain>,
  data: number[][],
): { label: number; confidence: number }[] {
  const n = data.length;
  const d = data[0]?.length ?? 0;
  const results = new Array<{ label: number; confidence: number }>(n);
  const scores = new Float64Array(model.nClasses);

  for (let i = 0; i < n; i++) {
    let bestClass = 0;
    let bestScore = -1;

    for (let ci = 0; ci < model.nClasses; ci++) {
      const w = model.weights[ci];
      let z = w[0];
      for (let j = 0; j < d; j++) z += data[i][j] * w[j + 1];
      const s = sigmoid(z);
      scores[ci] = s;
      if (s > bestScore) { bestScore = s; bestClass = ci; }
    }

    results[i] = { label: bestClass, confidence: bestScore };
  }

  return results;
}

// ---------------------------------------------------------------------------
// Decision Tree (CART, pre-allocated split buffers)
// ---------------------------------------------------------------------------

interface TreeNode {
  feature: number;
  threshold: number;
  left: TreeNode | null;
  right: TreeNode | null;
  label: number; // -1 if internal node
  depth: number;
}

function buildTree(
  data: number[][],
  labels: number[],
  indices: Int32Array,  // pre-allocated index buffer
  depth: number,
  maxDepth: number,
  d: number,
  classCount: number,
): TreeNode {
  const len = indices.length;

  // Count class frequencies (single pass)
  const freq = new Int32Array(classCount);
  let firstLabel = labels[indices[0]];
  for (let k = 0; k < len; k++) {
    const l = labels[indices[k]];
    freq[l]++;
    if (k === 0) firstLabel = l;
  }

  // Count non-zero classes
  let nClasses = 0;
  let majorityLabel = 0;
  let majorityCount = 0;
  for (let c = 0; c < classCount; c++) {
    if (freq[c] > 0) nClasses++;
    if (freq[c] > majorityCount) { majorityCount = freq[c]; majorityLabel = c; }
  }

  // Leaf conditions
  if (nClasses <= 1 || depth >= maxDepth || len < 2) {
    return { feature: 0, threshold: 0, left: null, right: null, label: majorityLabel, depth };
  }

  // Parent gini (single pass with existing freq)
  let parentGini = 1;
  for (let c = 0; c < classCount; c++) {
    if (freq[c] === 0) continue;
    const p = freq[c] / len;
    parentGini -= p * p;
  }

  // Find best split
  let bestGini = parentGini;
  let bestFeature = 0;
  let bestThreshold = 0;

  const leftFreq = new Int32Array(classCount);
  const rightFreq = new Int32Array(classCount);

  for (let f = 0; f < d; f++) {
    // Collect unique sorted thresholds for this feature
    const thresholds = new Float64Array(len);
    for (let k = 0; k < len; k++) thresholds[k] = data[indices[k]][f];
    thresholds.sort();

    // Deduplicate and sample (at most 10 thresholds)
    const step = Math.max(1, Math.floor(len / 10));
    for (let t = 0; t < len; t += step) {
      const thr = thresholds[t];

      // Single-pass left/right count
      leftFreq.fill(0);
      let leftCount = 0;
      for (let k = 0; k < len; k++) {
        if (data[indices[k]][f] <= thr) {
          leftFreq[labels[indices[k]]]++;
          leftCount++;
        }
      }

      if (leftCount === 0 || leftCount === len) continue;
      const rightCount = len - leftCount;

      let gini = 0;
      for (let c = 0; c < classCount; c++) {
        if (leftFreq[c] === 0) continue;
        const p = leftFreq[c] / leftCount;
        gini += (leftCount / len) * p * (1 - p);
      }
      // Right freq = freq - leftFreq
      for (let c = 0; c < classCount; c++) {
        const rc = freq[c] - leftFreq[c];
        if (rc === 0) continue;
        const p = rc / rightCount;
        gini += (rightCount / len) * p * (1 - p);
      }

      if (gini < bestGini) {
        bestGini = gini;
        bestFeature = f;
        bestThreshold = thr;
      }

      // Early termination: perfect split found
      if (gini === 0) break;
    }
    if (bestGini === 0) break;
  }

  // No improvement
  if (bestGini >= parentGini) {
    return { feature: 0, threshold: 0, left: null, right: null, label: majorityLabel, depth };
  }

  // Partition indices (pre-allocated buffers)
  const leftIndices = new Int32Array(len);
  const rightIndices = new Int32Array(len);
  let leftLen = 0;
  let rightLen = 0;

  for (let k = 0; k < len; k++) {
    if (data[indices[k]][bestFeature] <= bestThreshold) {
      leftIndices[leftLen++] = indices[k];
    } else {
      rightIndices[rightLen++] = indices[k];
    }
  }

  return {
    feature: bestFeature,
    threshold: bestThreshold,
    left: buildTree(data, labels, leftIndices.subarray(0, leftLen), depth + 1, maxDepth, d, classCount),
    right: buildTree(data, labels, rightIndices.subarray(0, rightLen), depth + 1, maxDepth, d, classCount),
    label: -1,
    depth,
  };
}

function predictTree(node: TreeNode, query: number[]): number {
  while (node.label === -1) {
    node = query[node.feature] <= node.threshold ? node.left! : node.right!;
  }
  return node.label;
}

function treeDepth(node: TreeNode): number {
  if (node.label !== -1) return node.depth;
  return Math.max(
    node.left ? treeDepth(node.left) : 0,
    node.right ? treeDepth(node.right) : 0,
  );
}

function treeNodes(node: TreeNode): number {
  if (node.label !== -1) return 1;
  return 1 + (node.left ? treeNodes(node.left) : 0) + (node.right ? treeNodes(node.right) : 0);
}

// ---------------------------------------------------------------------------
// Linear regression (single-pass, no intermediate objects)
// ---------------------------------------------------------------------------

function linearRegressionFit(x: number[], y: number[]): { slope: number; intercept: number; predict: (xi: number) => number } {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX + 1e-30);
  const intercept = (sumY - slope * sumX) / n;
  return {
    slope,
    intercept,
    predict: (xi: number) => slope * xi + intercept,
  };
}

// ---------------------------------------------------------------------------
// Polynomial regression (Vandermonde, Gauss-Jordan)
// ---------------------------------------------------------------------------

function polyFit(x: number[], y: number[], degree: number): { coefficients: number[]; predict: (xi: number) => number } {
  const n = x.length;
  const d = degree + 1;

  // Build X^T*X and X^T*y in one pass
  const xtX = Array.from({ length: d }, () => new Float64Array(d));
  const xtY = new Float64Array(d);

  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    let xp = 1;
    for (let j = 0; j < d; j++) {
      xtY[j] += xp * yi;
      let xq = 1;
      for (let k = 0; k < d; k++) {
        xtX[j][k] += xp * xq;
        xq *= xi;
      }
      xp *= xi;
    }
  }

  // Gauss-Jordan elimination (augmented matrix)
  const aug = Array.from({ length: d }, (_, i) => new Float64Array(d + 1));
  for (let j = 0; j < d; j++) {
    for (let k = 0; k < d; k++) aug[j][k] = xtX[j][k];
    aug[j][d] = xtY[j];
  }

  for (let col = 0; col < d; col++) {
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < d; row++) {
      const v = Math.abs(aug[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxRow !== col) {
      const tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp;
    }
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let j = col; j <= d; j++) aug[col][j] /= pivot;
    for (let row = 0; row < d; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= d; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  const coefficients = Array.from({ length: d }, (_, i) => aug[i][d]);
  return {
    coefficients,
    predict: (xi: number) => {
      let val = 0;
      let p = 1;
      for (let j = 0; j < d; j++) { val += coefficients[j] * p; p *= xi; }
      return val;
    },
  };
}

// ---------------------------------------------------------------------------
// Exponential regression: y = a * e^(bx)
// ---------------------------------------------------------------------------

function expFit(x: number[], y: number[]): { a: number; b: number; rSquared: number; predict: (xi: number) => number; doublingTime: () => number } {
  // Filter valid indices (single pass)
  const validIndices: number[] = [];
  for (let i = 0; i < y.length; i++) {
    if (y[i] > 0) validIndices.push(i);
  }

  if (validIndices.length < 2) {
    return { a: 1, b: 0, rSquared: 0, predict: () => y.reduce((s, v) => s + v, 0) / y.length, doublingTime: () => Infinity };
  }

  const vx = new Float64Array(validIndices.length);
  const logY = new Float64Array(validIndices.length);
  const vy = new Float64Array(validIndices.length);
  for (let k = 0; k < validIndices.length; k++) {
    const i = validIndices[k];
    vx[k] = x[i];
    logY[k] = Math.log(y[i]);
    vy[k] = y[i];
  }

  const lr = linearRegressionFit(Array.from(vx), Array.from(logY));
  const a = Math.exp(lr.intercept);
  const b = lr.slope;

  // R² computed in single pass
  const vn = validIndices.length;
  let meanY = 0;
  for (let k = 0; k < vn; k++) meanY += vy[k];
  meanY /= vn;
  let ssRes = 0, ssTot = 0;
  for (let k = 0; k < vn; k++) {
    const pred = a * Math.exp(b * vx[k]);
    const rd = vy[k] - pred;
    ssRes += rd * rd;
    const td = vy[k] - meanY;
    ssTot += td * td;
  }

  return {
    a, b,
    rSquared: ssTot === 0 ? 1 : 1 - ssRes / ssTot,
    predict: (xi: number) => a * Math.exp(b * xi),
    doublingTime: () => (b === 0 ? Infinity : Math.log(2) / b),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify traces using k-NN, logistic regression, decision tree, or naive Bayes.
 */
export async function classifyTraces(
  featuresJson: Array<Record<string, unknown>>,
  options: {
    targetKey?: string;
    method?: ClassificationMethod;
    k?: number;
    maxDepth?: number;
  } = {},
): Promise<ClassificationResult> {
  const targetKey = options.targetKey ?? 'outcome';
  const method = options.method ?? 'knn';
  const matrix = buildFeatureMatrix(featuresJson, undefined, targetKey);

  if (matrix.data.length === 0 || matrix.labels.length === 0) {
    return { method, predictions: [], modelInfo: { error: 'No features or labels available' } };
  }

  const { encoded, reverseMap } = encodeLabels(matrix.labels);

  if (method === 'knn') {
    const k = options.k ?? 5;
    const col = toColumnar(matrix.data);
    const batch = knnBatch(col, encoded, k);
    return {
      method: 'knn',
      predictions: matrix.caseIds.map((caseId, i) => ({
        caseId,
        predicted: reverseMap.get(batch[i].label) ?? 'unknown',
        confidence: batch[i].confidence,
      })),
      modelInfo: { k, featureCount: col.d, traceCount: col.n, classCount: reverseMap.size },
    };
  }

  if (method === 'logistic_regression') {
    const model = logisticRegressionTrain(matrix.data, encoded);
    const batch = logisticRegressionPredictBatch(model, matrix.data);
    return {
      method: 'logistic_regression',
      predictions: matrix.caseIds.map((caseId, i) => ({
        caseId,
        predicted: reverseMap.get(batch[i].label) ?? 'unknown',
        confidence: batch[i].confidence,
      })),
      modelInfo: { weights: model.weights, iterations: model.iterations, featureCount: matrix.featureNames.length, traceCount: matrix.data.length, classCount: reverseMap.size },
    };
  }

  if (method === 'decision_tree') {
    const maxDepth = options.maxDepth ?? 5;
    const classCount = reverseMap.size;
    const n = matrix.data.length;
    const d = matrix.featureNames.length;
    const indices = new Int32Array(n);
    for (let i = 0; i < n; i++) indices[i] = i;
    const tree = buildTree(matrix.data, encoded, indices, 0, maxDepth, d, classCount);
    return {
      method: 'decision_tree',
      predictions: matrix.caseIds.map((caseId, i) => ({
        caseId,
        predicted: reverseMap.get(predictTree(tree, matrix.data[i])) ?? 'unknown',
        confidence: 1,
      })),
      modelInfo: { depth: treeDepth(tree), nNodes: treeNodes(tree), featureCount: d, traceCount: n, classCount: reverseMap.size },
    };
  }

  // naive_bayes
  const model = gaussianNBTrain(matrix.data, encoded);
  const batch = gaussianNBPredictBatch(model, matrix.data);
  return {
    method: 'naive_bayes',
    predictions: matrix.caseIds.map((caseId, i) => ({
      caseId,
      predicted: reverseMap.get(batch[i].label) ?? 'unknown',
      confidence: batch[i].confidence,
    })),
    modelInfo: { nClasses: model.nClasses, nFeatures: model.nFeatures, featureCount: matrix.featureNames.length, traceCount: matrix.data.length, classCount: reverseMap.size },
  };
}

/**
 * Predict remaining case time using regression on trace features.
 */
export async function regressRemainingTime(
  featuresJson: Array<Record<string, unknown>>,
  options: {
    targetKey?: string;
    method?: RegressionMethod;
    degree?: number;
  } = {},
): Promise<RegressionResult> {
  const targetKey = options.targetKey ?? 'remaining_time';
  const method = options.method ?? 'linear_regression';
  const matrix = buildFeatureMatrix(featuresJson, targetKey);

  if (matrix.data.length < 2) {
    throw new Error('Not enough traces for regression (need at least 2)');
  }

  const x = matrix.data.map(row => row[0] ?? 0);
  const y = matrix.targets;

  if (method === 'polynomial_regression') {
    const degree = options.degree ?? 2;
    const model = polyFit(x, y, degree);
    const predicted = x.map(xi => model.predict(xi));
    return {
      method: 'polynomial_regression', rSquared: rSquared(y, predicted), rmse: rmse(y, predicted), mae: mae(y, predicted),
      predictions: matrix.caseIds.map((caseId, i) => ({ caseId, actual: y[i], predicted: predicted[i] })),
      degree, coefficients: model.coefficients,
    };
  }

  if (method === 'exponential_regression') {
    const model = expFit(x, y);
    const predicted = x.map(xi => model.predict(xi));
    return {
      method: 'exponential_regression', rSquared: model.rSquared, rmse: rmse(y, predicted), mae: mae(y, predicted),
      predictions: matrix.caseIds.map((caseId, i) => ({ caseId, actual: y[i], predicted: predicted[i] })),
      growthRate: model.b, amplitude: model.a, doublingTime: model.doublingTime(),
    };
  }

  const model = linearRegressionFit(x, y);
  const predicted = x.map(xi => model.predict(xi));
  return {
    method: 'linear_regression', slope: model.slope, intercept: model.intercept,
    rSquared: rSquared(y, predicted), rmse: rmse(y, predicted), mae: mae(y, predicted),
    predictions: matrix.caseIds.map((caseId, i) => ({ caseId, actual: y[i], predicted: predicted[i] })),
  };
}
