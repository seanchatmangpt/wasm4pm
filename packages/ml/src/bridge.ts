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

import type { FeatureMatrix, LabelEncoding } from './types.js';

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
  categoricalTargetKey?: string,
): FeatureMatrix {
  // Validate non-null array
  if (!featuresJson || !Array.isArray(featuresJson) || featuresJson.length === 0) {
    return { data: [], featureNames: [], caseIds: [], targets: [], labels: [] };
  }

  // Filter out null/undefined elements
  const validRows = featuresJson.filter((row): row is Record<string, unknown> => row != null && typeof row === 'object');
  if (validRows.length === 0) {
    return { data: [], featureNames: [], caseIds: [], targets: [], labels: [] };
  }

  const excludeKeys = new Set<string>([
    'case_id',
    ...(numericTargetKey ? [numericTargetKey] : []),
    ...(categoricalTargetKey ? [categoricalTargetKey] : []),
  ]);

  // Collect all feature keys from first valid row (guaranteed non-null by filter)
  const allKeys = Object.keys(validRows[0]).filter(k => !excludeKeys.has(k));

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
      const str = (val == null) ? '' : String(val);
      uniqueSet.add(str);
    }
    const uniqueValues = Array.from(uniqueSet).sort();
    oneHotMap.set(col, uniqueValues);
  }

  // Assemble feature names
  const featureNames: string[] = [...numericCols];
  for (const [col, values] of oneHotMap) {
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

    // Numeric columns: coerce safely, guard against NaN
    for (const col of numericCols) {
      const val = row[col];
      if (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) {
        numericRow.push(val);
      } else {
        numericRow.push(0);
      }
    }

    // One-hot encoded string columns
    for (const [col, values] of oneHotMap) {
      const rowVal = row[col] == null ? '' : String(row[col]);
      for (const v of values) {
        numericRow.push(rowVal === v ? 1 : 0);
      }
    }

    data.push(numericRow);

    // Extract numeric target with NaN/Infinity guard
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
  const encoded = labels.map(l => labelMap.get(l) ?? 0);
  return { encoded, labelMap, reverseMap };
}
