/**
 * Preprocessing Guards — 5 Critical Data Validation Checks
 *
 * Before classification/regression/clustering, all raw features must pass:
 * 1. Zero-variance detection and removal
 * 2. Feature scaling (min-max normalization)
 * 3. Missing value imputation (forward-fill or mean)
 * 4. Outlier detection (IQR-based capping)
 * 5. Feature dimension validation (sufficient samples per feature)
 *
 * These guards prevent algorithms from receiving invalid data that would
 * corrupt training (e.g., zero-variance columns waste dimensions, missing values
 * break distance metrics, outliers distort regression).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// PreprocessingReport
// ---------------------------------------------------------------------------

export const PreprocessingReportSchema = z.object({
  /** Pass/fail status */
  status: z.enum(['pass', 'fail']),
  /** Count of zero-variance columns removed */
  zeroVarianceColumnsRemoved: z.number(),
  /** Count of rows with missing values imputed */
  rowsWithMissingValuesImputed: z.number(),
  /** Count of outliers detected and capped */
  outliersDetected: z.number(),
  /** True if feature dimension is sufficient for sample size */
  suffientSampleRatio: z.boolean(),
  /** Count of features after preprocessing (includes scaled features) */
  finalFeatureCount: z.number(),
  /** Warnings/errors encountered */
  issues: z.array(z.string()),
});

export type PreprocessingReport = z.infer<typeof PreprocessingReportSchema>;

/**
 * Guard 1: Detect and remove zero-variance columns.
 *
 * Zero-variance columns contain identical values across all rows.
 * They waste dimensions without providing discriminative information.
 *
 * @param data - Numeric feature matrix (rows = samples, cols = features)
 * @param threshold - Variance threshold for detection (default 1e-10)
 * @returns Columns with variance > threshold, and indices to keep
 */
export function filterZeroVarianceColumns(
  data: number[][],
  threshold = 1e-10
): { filtered: number[][]; indicesToKeep: number[]; removed: number[] } {
  if (!data || data.length === 0) {
    return { filtered: [], indicesToKeep: [], removed: [] };
  }

  const numCols = data[0]?.length ?? 0;
  const numRows = data.length;

  if (numCols === 0) {
    return { filtered: [], indicesToKeep: [], removed: [] };
  }

  // Compute variance for each column (only over finite values)
  const variances: number[] = [];
  for (let j = 0; j < numCols; j++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < numRows; i++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        sum += val;
        count++;
      }
    }
    const mean = count > 0 ? sum / count : 0;

    let sumSq = 0;
    for (let i = 0; i < numRows; i++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        const diff = val - mean;
        sumSq += diff * diff;
      }
    }
    const variance = count > 0 ? sumSq / count : 0;
    variances.push(variance);
  }

  // Identify columns to keep (variance > threshold)
  const indicesToKeep: number[] = [];
  const removed: number[] = [];
  for (let j = 0; j < numCols; j++) {
    if (variances[j] > threshold) {
      indicesToKeep.push(j);
    } else {
      removed.push(j);
    }
  }

  // Filter data to keep only selected columns
  const filtered = data.map((row) => indicesToKeep.map((j) => row[j]));

  return { filtered, indicesToKeep, removed };
}

/**
 * Guard 2: Impute missing values (NaN, Infinity, undefined).
 *
 * Imputation strategy:
 * - For each column with missing values:
 *   1. Compute column mean from finite values
 *   2. Replace all non-finite values with column mean
 *   3. If column is all non-finite, fill with 0
 *
 * @param data - Numeric feature matrix with possible NaN/Infinity values
 * @returns Imputed matrix, count of rows affected
 */
export function imputeMissingValues(data: number[][]): { imputed: number[][]; rowsAffected: number } {
  if (!data || data.length === 0) {
    return { imputed: [], rowsAffected: 0 };
  }

  const numRows = data.length;
  const numCols = data[0]?.length ?? 0;

  // Deep copy to avoid mutation
  const imputed = data.map((row) => [...row]);

  let totalRowsAffected = 0;

  // Per-column imputation
  for (let j = 0; j < numCols; j++) {
    // Compute column mean (ignoring NaN/Infinity)
    let sum = 0;
    let count = 0;
    for (let i = 0; i < numRows; i++) {
      const val = imputed[i][j];
      if (Number.isFinite(val)) {
        sum += val;
        count++;
      }
    }
    const mean = count > 0 ? sum / count : 0;

    // Replace all non-finite values with column mean
    for (let i = 0; i < numRows; i++) {
      const val = imputed[i][j];
      if (!Number.isFinite(val)) {
        imputed[i][j] = mean;
        totalRowsAffected++;
      }
    }
  }

  return { imputed, rowsAffected: totalRowsAffected };
}

/**
 * Guard 3: Detect and cap outliers using Interquartile Range (IQR).
 *
 * Outlier definition: Values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
 * For outliers detected, cap to the boundary rather than remove.
 *
 * @param data - Numeric feature matrix
 * @param iqrMultiplier - Multiplier for IQR bounds (default 1.5)
 * @returns Data with outliers capped, count of outliers detected
 */
export function capOutliers(
  data: number[][],
  iqrMultiplier = 1.5
): { capped: number[][]; outliersDetected: number } {
  if (!data || data.length === 0) {
    return { capped: [], outliersDetected: 0 };
  }

  const numRows = data.length;
  const numCols = data[0]?.length ?? 0;

  const capped = data.map((row) => [...row]);
  let totalOutliers = 0;

  // Per-column outlier detection and capping
  for (let j = 0; j < numCols; j++) {
    const col = capped.map((row) => row[j]).filter(Number.isFinite);
    if (col.length === 0) continue;

    // Compute quartiles
    col.sort((a, b) => a - b);
    const q1Idx = Math.floor(col.length * 0.25);
    const q3Idx = Math.floor(col.length * 0.75);
    const q1 = col[q1Idx];
    const q3 = col[q3Idx];
    const iqr = q3 - q1;

    const lowerBound = q1 - iqrMultiplier * iqr;
    const upperBound = q3 + iqrMultiplier * iqr;

    // Cap outliers in original order
    for (let i = 0; i < numRows; i++) {
      const val = capped[i][j];
      if (Number.isFinite(val)) {
        if (val < lowerBound) {
          capped[i][j] = lowerBound;
          totalOutliers++;
        } else if (val > upperBound) {
          capped[i][j] = upperBound;
          totalOutliers++;
        }
      }
    }
  }

  return { capped, outliersDetected: totalOutliers };
}

/**
 * Guard 4: Apply min-max feature scaling to [0, 1] range.
 *
 * Scaling ensures all features have equal magnitude, preventing
 * algorithms (k-NN, logistic regression) from being biased toward
 * features with large ranges.
 *
 * Constant features (min == max) are mapped to 0.5.
 *
 * @param data - Numeric feature matrix
 * @returns Scaled matrix to [0, 1], min/max for inverse transform
 */
export function scaleFeatures(
  data: number[][]
): { scaled: number[][]; mins: number[]; maxs: number[] } {
  if (!data || data.length === 0) {
    return { scaled: [], mins: [], maxs: [] };
  }

  const numRows = data.length;
  const numCols = data[0]?.length ?? 0;

  // Compute min/max per column
  const mins = new Array(numCols).fill(Infinity);
  const maxs = new Array(numCols).fill(-Infinity);

  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        mins[j] = Math.min(mins[j], val);
        maxs[j] = Math.max(maxs[j], val);
      }
    }
  }

  // Scale each column
  const scaled = data.map((row) => {
    return row.map((val, j) => {
      const min = mins[j];
      const max = maxs[j];
      if (min === Infinity || max === -Infinity) {
        // No valid values in this column
        return 0.5;
      } else if (max === min) {
        // Constant feature
        return 0.5;
      } else {
        return (val - min) / (max - min);
      }
    });
  });

  return { scaled, mins, maxs };
}

/**
 * Guard 5: Validate feature dimension is sufficient for sample size.
 *
 * Heuristic: sample_count should be >= 10 * feature_count to avoid
 * overfitting and poor generalization.
 *
 * @param data - Numeric feature matrix
 * @param minRatio - Minimum samples-per-feature (default 10)
 * @returns Pass/fail status and detailed metrics
 */
export function validateSampleFeatureRatio(
  data: number[][],
  minRatio = 10
): { sufficient: boolean; sampleCount: number; featureCount: number; actualRatio: number } {
  const sampleCount = data?.length ?? 0;
  const featureCount = data?.[0]?.length ?? 0;

  if (sampleCount === 0 || featureCount === 0) {
    return { sufficient: false, sampleCount, featureCount, actualRatio: 0 };
  }

  const actualRatio = sampleCount / featureCount;
  const sufficient = actualRatio >= minRatio;

  return { sufficient, sampleCount, featureCount, actualRatio };
}

/**
 * Comprehensive preprocessing pipeline: Apply all 5 guards.
 *
 * Order of operations:
 * 1. Remove zero-variance columns
 * 2. Impute missing values
 * 3. Cap outliers
 * 4. Scale features to [0,1]
 * 5. Validate dimension sufficiency
 *
 * @param data - Raw numeric feature matrix
 * @returns Preprocessed data and detailed report
 */
export function preprocessFeatures(data: number[][]): {
  preprocessed: number[][];
  report: PreprocessingReport;
  mins?: number[];
  maxs?: number[];
} {
  const issues: string[] = [];
  let current = data;

  // Guard 1: Remove zero-variance columns
  const { filtered: filtered1, removed: zeroVarRemoved } = filterZeroVarianceColumns(current);
  if (zeroVarRemoved.length > 0) {
    current = filtered1;
  }

  // Guard 2: Impute missing values
  const { imputed, rowsAffected: rowsImputed } = imputeMissingValues(current);
  if (rowsImputed > 0) {
    current = imputed;
  }

  // Guard 3: Cap outliers
  const { capped, outliersDetected } = capOutliers(current);
  if (outliersDetected > 0) {
    current = capped;
  }

  // Guard 4: Scale features
  const { scaled, mins, maxs } = scaleFeatures(current);
  current = scaled;

  // Guard 5: Validate dimension
  const { sufficient: suffientRatio } = validateSampleFeatureRatio(current);
  if (!suffientRatio) {
    const { sampleCount, featureCount, actualRatio } = validateSampleFeatureRatio(current);
    issues.push(
      `Low sample-to-feature ratio: ${actualRatio.toFixed(2)} (need ${sampleCount} >= 10 * ${featureCount})`
    );
  }

  const finalFeatureCount = current?.[0]?.length ?? 0;

  return {
    preprocessed: current,
    report: {
      status: issues.length === 0 ? 'pass' : 'fail',
      zeroVarianceColumnsRemoved: zeroVarRemoved.length,
      rowsWithMissingValuesImputed: rowsImputed,
      outliersDetected,
      suffientSampleRatio: suffientRatio,
      finalFeatureCount,
      issues,
    },
    mins,
    maxs,
  };
}
