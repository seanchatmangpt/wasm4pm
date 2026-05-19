/**
 * Feature matrix bridge — converts wasm4pm feature extraction JSON
 * into numeric matrices for native ML algorithms.
 *
 * Marshaling strategy:
 *   - Numeric columns: coerced to number (non-numeric → 0)
 *   - String columns: one-hot encoded (unknown values → all 0s)
 *   - case_id: extracted to separate array, skipped from features
 *   - Target extraction: numeric and categorical targets handled separately
 *
 * Error handling:
 *   - Null/undefined objects in array → skipped with warning logged
 *   - Missing case_id → replaced with index-based ID
 *   - Invalid numeric values → coerced to 0
 */

import type { EmptyInputWarning, FeatureMatrix, LabelEncoding } from './types.js';

/** Helper: empty FeatureMatrix with a typed sentinel warning. */
function emptyMatrix(warning: EmptyInputWarning): FeatureMatrix {
  return {
    data: [],
    featureNames: [],
    caseIds: [],
    targets: [],
    labels: [],
    metadata: { warning },
  };
}

/**
 * Convert extract_case_features JSON output to a numeric feature matrix.
 *
 * Handles heterogeneous features by one-hot encoding strings
 * and preserving numeric columns directly.
 *
 * Defensive marshaling:
 *   - Validates non-null input elements
 *   - Guards against missing case_id
 *   - Coerces non-numeric values safely
 *   - Handles degenerate data (all same value, empty rows)
 *
 * @param featuresJson - Array of feature objects from wasm.extract_case_features()
 * @param numericTargetKey - Key for numeric target (e.g., 'remaining_time')
 * @param categoricalTargetKey - Key for categorical target (e.g., 'outcome')
 * @throws Error if input is null or not an array (type-level guard via TypeScript)
 * @returns FeatureMatrix with validated numeric data, empty result for invalid input
 */
export function buildFeatureMatrix(
  featuresJson: Array<Record<string, unknown>>,
  numericTargetKey?: string,
  categoricalTargetKey?: string
): FeatureMatrix {
  // Validate non-null array
  if (!featuresJson || !Array.isArray(featuresJson) || featuresJson.length === 0) {
    return emptyMatrix({
      code: 'empty_input',
      message: 'buildFeatureMatrix received an empty or non-array input — no rows to extract.',
      inputLength: Array.isArray(featuresJson) ? featuresJson.length : 0,
      minRequired: 1,
    });
  }

  // Filter out null/undefined elements
  const validRows = featuresJson.filter(
    (row): row is Record<string, unknown> => row != null && typeof row === 'object'
  );
  if (validRows.length === 0) {
    return emptyMatrix({
      code: 'no_valid_features',
      message: `buildFeatureMatrix received ${featuresJson.length} rows but none were non-null objects.`,
      inputLength: featuresJson.length,
      minRequired: 1,
    });
  }

  const excludeKeys = new Set<string>([
    'case_id',
    ...(numericTargetKey ? [numericTargetKey] : []),
    ...(categoricalTargetKey ? [categoricalTargetKey] : []),
  ]);

  // Collect all feature keys from first valid row (guaranteed non-null by filter)
  const allKeys = Object.keys(validRows[0]).filter((k) => !excludeKeys.has(k));

  // Separate numeric vs string columns from first valid row
  const numericCols: string[] = [];
  const stringCols: string[] = [];
  for (const key of allKeys) {
    const sampleVal = validRows[0][key];
    if (typeof sampleVal === 'number' && Number.isFinite(sampleVal)) {
      numericCols.push(key);
    } else if (typeof sampleVal === 'string') {
      stringCols.push(key);
    }
    // Skip other types (objects, arrays, null, NaN, Infinity, etc.)
  }

  // Build one-hot encoding map for string columns
  // Collect unique values across all rows with null-safety
  const oneHotMap = new Map<string, string[]>();
  for (const col of stringCols) {
    const uniqueSet = new Set<string>();
    for (const row of validRows) {
      const val = row[col];
      const str = val == null ? '' : String(val);
      uniqueSet.add(str);
    }
    const uniqueValues = Array.from(uniqueSet).sort();
    oneHotMap.set(col, uniqueValues);
  }

  // Assemble feature names
  // GAP 3 FIX: Sort numeric columns and categorical columns for deterministic ordering
  const sortedNumericCols = [...numericCols].sort();
  const featureNames: string[] = [...sortedNumericCols];
  // Iterate over categorical columns in sorted order for consistency
  const sortedCategoricalCols = Array.from(oneHotMap.keys()).sort();
  for (const col of sortedCategoricalCols) {
    const values = oneHotMap.get(col)!;
    for (const v of values) {
      featureNames.push(`${col}=${v}`);
    }
  }

  // Build numeric matrix with defensive guards
  const data: number[][] = [];
  const caseIds: string[] = [];
  const targets: number[] = [];
  const labels: string[] = [];

  for (let rowIdx = 0; rowIdx < validRows.length; rowIdx++) {
    const row = validRows[rowIdx];

    // Extract case_id with fallback to row index
    const caseIdVal = row.case_id;
    if (caseIdVal == null) {
      caseIds.push(`row_${rowIdx}`);
    } else {
      caseIds.push(String(caseIdVal));
    }

    const numericRow: number[] = [];

    // Numeric columns: coerce safely, guard against NaN, Infinity, and missing values
    // CRITICAL: Handle missing properties (undefined), NaN, Infinity all as 0
    // GAP 1 FIX: Explicitly check Number.isFinite() which rejects NaN, Infinity, -Infinity
    // GAP 3 FIX: Use sorted numeric columns to match feature name order
    for (const col of sortedNumericCols) {
      const val = row[col];
      if (typeof val === 'number' && Number.isFinite(val)) {
        numericRow.push(val);
      } else {
        // Coerce to 0: missing, null, NaN, Infinity, -Infinity, non-numeric
        numericRow.push(0);
      }
    }

    // One-hot encoded string columns (in sorted order for determinism)
    // GAP 3 FIX: Use sortedCategoricalCols to ensure consistent column ordering
    for (const col of sortedCategoricalCols) {
      const values = oneHotMap.get(col)!;
      const rowVal = row[col] == null ? '' : String(row[col]);
      for (const v of values) {
        numericRow.push(rowVal === v ? 1 : 0);
      }
    }

    data.push(numericRow);

    // Extract numeric target with NaN/Infinity guard
    // CRITICAL: Must handle NaN explicitly since typeof NaN === 'number'
    // GAP 4 FIX: Use Number.isFinite() which rejects NaN, Infinity, -Infinity
    if (numericTargetKey) {
      const val = row[numericTargetKey];
      if (typeof val === 'number' && Number.isFinite(val)) {
        targets.push(val);
      } else {
        targets.push(0);
      }
    }

    // Extract categorical target
    if (categoricalTargetKey) {
      const val = row[categoricalTargetKey];
      labels.push(val == null ? '' : String(val));
    }
  }

  return { data, featureNames, caseIds, targets, labels };
}

/**
 * Encode string labels to numeric indices for classifiers.
 */
export function encodeLabels(labels: string[]): LabelEncoding {
  const unique = [...new Set(labels)].sort();
  const labelMap = new Map(unique.map((l, i) => [l, i]));
  const reverseMap = new Map(unique.map((l, i) => [i, l]));
  const encoded = labels.map((l) => labelMap.get(l) ?? 0);
  return { encoded, labelMap, reverseMap };
}

/**
 * Compute variance (population variance) for a column.
 */
function columnVariance(column: number[]): number {
  if (column.length === 0) return 0;
  const mean = column.reduce((a, b) => a + b, 0) / column.length;
  const sumSq = column.reduce((sum, val) => sum + (val - mean) ** 2, 0);
  return sumSq / column.length;
}

/**
 * Select top features by variance, filtering out zero-variance
 * and near-duplicates (correlation > threshold).
 *
 * @param data - Numeric feature matrix (rows = samples, cols = features)
 * @param topK - Maximum number of features to keep (default 15)
 * @param correlationThreshold - Remove features with |r| > this (default 0.95)
 * @returns Array of selected feature indices, sorted by descending variance
 */
export function selectTopFeatures(
  data: number[][],
  topK: number = 15,
  correlationThreshold: number = 0.95
): number[] {
  if (!data || data.length === 0 || data[0].length === 0) {
    return [];
  }

  const numCols = data[0].length;

  // Transpose to get columns
  const columns: number[][] = Array(numCols)
    .fill(null)
    .map((_, colIdx) => data.map((row) => row[colIdx]));

  // Compute variance for each feature
  const variances: Array<{ idx: number; variance: number }> = [];
  for (let i = 0; i < numCols; i++) {
    const variance = columnVariance(columns[i]);
    // Skip zero-variance columns
    if (variance > 1e-10) {
      variances.push({ idx: i, variance });
    }
  }

  // Sort by descending variance
  variances.sort((a, b) => b.variance - a.variance);

  // Greedily select features, skipping highly correlated ones
  const selected: number[] = [];
  const selectedCols: number[] = [];

  for (const { idx } of variances) {
    // Check if this feature is highly correlated with any already-selected feature
    let isCorrelated = false;
    for (const selectedIdx of selectedCols) {
      const corr = Math.abs(pearsonCorrelation(columns[idx], columns[selectedIdx]));
      if (corr > correlationThreshold) {
        isCorrelated = true;
        break;
      }
    }
    if (!isCorrelated) {
      selected.push(idx);
      selectedCols.push(idx);
      if (selected.length >= topK) break;
    }
  }

  return selected.sort((a, b) => a - b);
}

/**
 * Compute Pearson correlation coefficient between two columns.
 */
function pearsonCorrelation(col1: number[], col2: number[]): number {
  if (col1.length !== col2.length || col1.length === 0) return 0;

  const n = col1.length;
  const mean1 = col1.reduce((a, b) => a + b, 0) / n;
  const mean2 = col2.reduce((a, b) => a + b, 0) / n;

  let covariance = 0;
  let sumSq1 = 0;
  let sumSq2 = 0;

  for (let i = 0; i < n; i++) {
    const dev1 = col1[i] - mean1;
    const dev2 = col2[i] - mean2;
    covariance += dev1 * dev2;
    sumSq1 += dev1 * dev1;
    sumSq2 += dev2 * dev2;
  }

  const denom = Math.sqrt(sumSq1 * sumSq2);
  return denom === 0 ? 0 : covariance / denom;
}

/**
 * Normalize feature matrix to [0, 1] range (min-max scaling).
 *
 * Each feature is scaled as: (x - min) / (max - min)
 * Constant features (max == min) remain at 0.5.
 *
 * Used before algorithms sensitive to feature scale (kNN, logistic regression).
 */
export function normalizeFeatures(data: number[][]): number[][] {
  if (!data || data.length === 0 || data[0].length === 0) {
    return data;
  }

  const numCols = data[0].length;
  const numRows = data.length;

  // Compute min/max for each column
  const mins = new Array<number>(numCols).fill(Infinity);
  const maxs = new Array<number>(numCols).fill(-Infinity);

  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        mins[j] = Math.min(mins[j], val);
        maxs[j] = Math.max(maxs[j], val);
      }
    }
  }

  // Normalize each column
  const normalized = data.map((row) => [...row]);
  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      const val = data[i][j];
      const min = mins[j];
      const max = maxs[j];
      if (min === Infinity || max === -Infinity) {
        normalized[i][j] = 0.5;
      } else if (max === min) {
        normalized[i][j] = 0.5;
      } else {
        normalized[i][j] = (val - min) / (max - min);
      }
    }
  }

  return normalized;
}
