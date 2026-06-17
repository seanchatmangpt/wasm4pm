/**
 * Bootstrap Confidence Intervals
 *
 * Nonparametric confidence interval estimation via bootstrap resampling.
 * Rank-1 Oracle: Deterministic via seeded RNG; no parametric assumptions.
 *
 * Usage:
 *   const ci = bootstrapCI(predictions, truth, 10000, 0.95);
 *   console.log(`Accuracy: ${ci.point} [${ci.lower}, ${ci.upper}]`);
 *
 * Resamples data with replacement, computes metric on each sample,
 * and extracts percentile bounds.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// BootstrapCIResult
// ---------------------------------------------------------------------------

export const BootstrapCIResultSchema = z.object({
  /** Metric name */
  metric: z.enum(['accuracy', 'mae', 'rmse', 'f1']),
  /** Point estimate (mean of bootstrap samples) */
  point: z.number(),
  /** Lower bound (percentile) */
  lower: z.number(),
  /** Upper bound (percentile) */
  upper: z.number(),
  /** Confidence level used (e.g., 0.95 for 95% CI) */
  confidenceLevel: z.number(),
  /** Bootstrap samples (for advanced analysis) */
  samples: z.array(z.number()).optional(),
});

/**
 * Confidence interval result with point estimate and bounds.
 */
export type BootstrapCIResult = z.infer<typeof BootstrapCIResultSchema>;

/**
 * Seeded random number generator for deterministic bootstrap.
 * Park-Miller LCG (Linear Congruential Generator).
 *
 * @param seed - Initial seed
 * @returns Function that returns next random number in [0, 1)
 */
export function seededRng(seed: number): () => number {
  let x = seed;
  const m = 2147483647; // 2^31 - 1
  const a = 16807;

  return () => {
    x = (a * x) % m;
    return x / m;
  };
}

/**
 * Compute accuracy: fraction of correct predictions.
 *
 * @param truth - True labels
 * @param predictions - Predicted labels
 * @returns Accuracy in [0, 1]
 */
export function accuracy(truth: number[], predictions: number[]): number {
  if (truth.length === 0) return 0;
  let correct = 0;
  for (let i = 0; i < truth.length; i++) {
    if (truth[i] === predictions[i]) correct++;
  }
  return correct / truth.length;
}

/**
 * Compute MAE (mean absolute error).
 *
 * @param truth - True values
 * @param predictions - Predicted values
 * @returns MAE
 */
export function mae(truth: number[], predictions: number[]): number {
  if (truth.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < truth.length; i++) {
    const d = truth[i] - predictions[i];
    sum += d < 0 ? -d : d;
  }
  return sum / truth.length;
}

/**
 * Compute RMSE (root mean squared error).
 *
 * @param truth - True values
 * @param predictions - Predicted values
 * @returns RMSE
 */
export function rmse(truth: number[], predictions: number[]): number {
  if (truth.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < truth.length; i++) {
    const d = truth[i] - predictions[i];
    sum += d * d;
  }
  return Math.sqrt(sum / truth.length);
}

/**
 * Compute F1 score (harmonic mean of precision and recall).
 * For multi-class, macro-average over classes.
 *
 * @param truth - True labels
 * @param predictions - Predicted labels
 * @returns F1 score in [0, 1]
 */
export function f1(truth: number[], predictions: number[]): number {
  if (truth.length === 0) return 0;

  // Get unique classes
  const classes = new Set<number>([...truth, ...predictions]);
  let sumF1 = 0;

  for (const cls of classes) {
    let tp = 0,
      fp = 0,
      fn = 0;
    for (let i = 0; i < truth.length; i++) {
      if (predictions[i] === cls && truth[i] === cls) tp++;
      else if (predictions[i] === cls && truth[i] !== cls) fp++;
      else if (predictions[i] !== cls && truth[i] === cls) fn++;
    }

    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1Score =
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    sumF1 += f1Score;
  }

  return sumF1 / classes.size;
}

/**
 * Bootstrap confidence interval for classification metrics.
 *
 * Resamples data with replacement, computes metric on each bootstrap sample,
 * and extracts percentile-based confidence bounds.
 *
 * Rank-1 Oracle: Deterministic via seeded RNG.
 *
 * @param predictions - Predicted labels
 * @param truth - True labels
 * @param nResamples - Number of bootstrap samples (default 10000)
 * @param confidenceLevel - CI level, e.g., 0.95 for 95% CI (default 0.95)
 * @param seed - Random seed for determinism (optional)
 * @returns Bootstrap CI result
 */
export function bootstrapCI(
  predictions: number[],
  truth: number[],
  nResamples: number = 10000,
  confidenceLevel: number = 0.95,
  seed?: number
): BootstrapCIResult {
  if (predictions.length === 0 || truth.length !== predictions.length) {
    return { metric: 'accuracy', point: 0, lower: 0, upper: 0, confidenceLevel };
  }

  // Use seeded RNG if seed provided
  const rng = seed !== undefined ? seededRng(seed) : Math.random;

  // Compute metric on original data (point estimate)
  const point = accuracy(truth, predictions);

  // Bootstrap resampling
  const samples: number[] = [];
  for (let b = 0; b < nResamples; b++) {
    const bootTruth: number[] = [];
    const bootPredictions: number[] = [];

    for (let i = 0; i < predictions.length; i++) {
      const idx = Math.floor(rng() * predictions.length);
      bootTruth.push(truth[idx]);
      bootPredictions.push(predictions[idx]);
    }

    const bootScore = accuracy(bootTruth, bootPredictions);
    samples.push(bootScore);
  }

  // Sort samples for percentile extraction
  samples.sort((a, b) => a - b);

  // Compute percentile bounds
  const alpha = 1 - confidenceLevel;
  const lowerIdx = Math.floor((alpha / 2) * nResamples);
  const upperIdx = Math.ceil((1 - alpha / 2) * nResamples);

  const lower = samples[Math.max(0, lowerIdx)];
  const upper = samples[Math.min(nResamples - 1, upperIdx)];

  return {
    metric: 'accuracy',
    point,
    lower,
    upper,
    confidenceLevel,
    samples,
  };
}

/**
 * Bootstrap CI for regression metrics (MAE, RMSE).
 *
 * @param predictions - Predicted values
 * @param truth - True values
 * @param metricType - Which metric to compute ('mae' or 'rmse')
 * @param nResamples - Number of bootstrap samples (default 10000)
 * @param confidenceLevel - CI level (default 0.95)
 * @param seed - Random seed for determinism
 * @returns Bootstrap CI result
 */
export function bootstrapRegressionCI(
  predictions: number[],
  truth: number[],
  metricType: 'mae' | 'rmse' = 'mae',
  nResamples: number = 10000,
  confidenceLevel: number = 0.95,
  seed?: number
): BootstrapCIResult {
  if (predictions.length === 0 || truth.length !== predictions.length) {
    return { metric: metricType, point: 0, lower: 0, upper: 0, confidenceLevel };
  }

  const rng = seed !== undefined ? seededRng(seed) : Math.random;

  // Select metric function
  const metricFn = metricType === 'mae' ? mae : rmse;

  // Point estimate
  const point = metricFn(truth, predictions);

  // Bootstrap resampling
  const samples: number[] = [];
  for (let b = 0; b < nResamples; b++) {
    const bootTruth: number[] = [];
    const bootPredictions: number[] = [];

    for (let i = 0; i < predictions.length; i++) {
      const idx = Math.floor(rng() * predictions.length);
      bootTruth.push(truth[idx]);
      bootPredictions.push(predictions[idx]);
    }

    const bootScore = metricFn(bootTruth, bootPredictions);
    samples.push(bootScore);
  }

  // Sort for percentile extraction
  samples.sort((a, b) => a - b);

  // Compute percentile bounds
  const alpha = 1 - confidenceLevel;
  const lowerIdx = Math.floor((alpha / 2) * nResamples);
  const upperIdx = Math.ceil((1 - alpha / 2) * nResamples);

  const lower = samples[Math.max(0, lowerIdx)];
  const upper = samples[Math.min(nResamples - 1, upperIdx)];

  return {
    metric: metricType as 'mae' | 'rmse',
    point,
    lower,
    upper,
    confidenceLevel,
    samples,
  };
}
