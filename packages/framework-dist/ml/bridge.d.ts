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
export declare function buildFeatureMatrix(featuresJson: Array<Record<string, unknown>>, numericTargetKey?: string, categoricalTargetKey?: string): FeatureMatrix;
/**
 * Encode string labels to numeric indices for classifiers.
 */
export declare function encodeLabels(labels: string[]): LabelEncoding;
/**
 * Select top features by variance, filtering out zero-variance
 * and near-duplicates (correlation > threshold).
 *
 * @param data - Numeric feature matrix (rows = samples, cols = features)
 * @param topK - Maximum number of features to keep (default 15)
 * @param correlationThreshold - Remove features with |r| > this (default 0.95)
 * @returns Array of selected feature indices, sorted by descending variance
 */
export declare function selectTopFeatures(data: number[][], topK?: number, correlationThreshold?: number): number[];
/**
 * Normalize feature matrix to [0, 1] range (min-max scaling).
 *
 * Each feature is scaled as: (x - min) / (max - min)
 * Constant features (max == min) remain at 0.5.
 *
 * Used before algorithms sensitive to feature scale (kNN, logistic regression).
 */
export declare function normalizeFeatures(data: number[][]): number[][];
//# sourceMappingURL=bridge.d.ts.map