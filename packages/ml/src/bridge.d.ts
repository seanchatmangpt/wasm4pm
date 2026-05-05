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
export declare function buildFeatureMatrix(
  featuresJson: Array<Record<string, unknown>>,
  numericTargetKey?: string,
  categoricalTargetKey?: string
): FeatureMatrix;
/**
 * Encode string labels to numeric indices for classifiers.
 */
export declare function encodeLabels(labels: string[]): LabelEncoding;
//# sourceMappingURL=bridge.d.ts.map
