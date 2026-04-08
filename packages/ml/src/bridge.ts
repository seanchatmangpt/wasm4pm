/**
 * Feature matrix bridge — converts wasm4pm feature extraction JSON
 * into numeric matrices for native ML algorithms.
 */

import type { FeatureMatrix, LabelEncoding } from './types.js';

/**
 * Convert extract_case_features JSON output to a numeric feature matrix.
 *
 * Handles heterogeneous features by one-hot encoding strings
 * and preserving numeric columns directly.
 *
 * @param featuresJson - Array of feature objects from wasm.extract_case_features()
 * @param numericTargetKey - Key for numeric target (e.g., 'remaining_time')
 * @param categoricalTargetKey - Key for categorical target (e.g., 'outcome')
 */
export function buildFeatureMatrix(
  featuresJson: Array<Record<string, unknown>>,
  numericTargetKey?: string,
  categoricalTargetKey?: string,
): FeatureMatrix {
  if (featuresJson.length === 0) {
    return { data: [], featureNames: [], caseIds: [], targets: [], labels: [] };
  }

  const excludeKeys = new Set<string>([
    'case_id',
    ...(numericTargetKey ? [numericTargetKey] : []),
    ...(categoricalTargetKey ? [categoricalTargetKey] : []),
  ]);

  // Collect all feature keys
  const allKeys = Object.keys(featuresJson[0]).filter(k => !excludeKeys.has(k));

  // Separate numeric vs string columns
  const numericCols: string[] = [];
  const stringCols: string[] = [];
  for (const key of allKeys) {
    const sampleVal = featuresJson[0][key];
    if (typeof sampleVal === 'number') {
      numericCols.push(key);
    } else if (typeof sampleVal === 'string') {
      stringCols.push(key);
    }
    // Skip other types (objects, arrays, etc.)
  }

  // Build one-hot encoding map for string columns
  const oneHotMap = new Map<string, string[]>();
  for (const col of stringCols) {
    const uniqueValues = [...new Set(featuresJson.map(f => String(f[col] ?? '')))].sort();
    oneHotMap.set(col, uniqueValues);
  }

  // Assemble feature names
  const featureNames: string[] = [...numericCols];
  for (const [col, values] of oneHotMap) {
    for (const v of values) {
      featureNames.push(`${col}=${v}`);
    }
  }

  // Build numeric matrix
  const data: number[][] = [];
  const caseIds: string[] = [];
  const targets: number[] = [];
  const labels: string[] = [];

  for (const row of featuresJson) {
    caseIds.push(String(row.case_id ?? ''));

    const numericRow: number[] = [];

    // Numeric columns
    for (const col of numericCols) {
      const val = row[col];
      numericRow.push(typeof val === 'number' ? val : 0);
    }

    // One-hot encoded string columns
    for (const [col, values] of oneHotMap) {
      const rowVal = String(row[col] ?? '');
      for (const v of values) {
        numericRow.push(rowVal === v ? 1 : 0);
      }
    }

    data.push(numericRow);

    // Targets
    if (numericTargetKey) {
      const val = row[numericTargetKey];
      targets.push(typeof val === 'number' ? val : 0);
    }
    if (categoricalTargetKey) {
      const val = row[categoricalTargetKey];
      labels.push(typeof val === 'string' ? val : String(val ?? ''));
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
