/**
 * PCA feature reduction — reduce high-dimensional trace features
 * to fewer dimensions for visualization or downstream ML.
 */

import { pca, minMaxNormalize } from 'micro-ml';
import { buildFeatureMatrix } from './bridge.js';
import type { PCAResult } from './types.js';

/**
 * Reduce feature dimensionality using PCA.
 *
 * @param featuresJson - Array of feature objects from wasm.extract_case_features()
 * @param options - PCA configuration
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
    throw new Error(
      'Need at least 2 traces and 2 features for PCA',
    );
  }

  let data = matrix.data;

  if (options.normalize !== false) {
    // Normalize each feature row to [0, 1]
    data = data.map(row => {
      const normalized = minMaxNormalize(row);
      return normalized.data;
    });
  }

  const nComponents = Math.min(
    options.nComponents ?? 2,
    matrix.featureNames.length,
  );

  const model = await pca(data, { nComponents });

  return {
    nComponents,
    explainedVariance: model.getExplainedVariance(),
    transformedData: model.getTransformed(),
    components: model.getComponents(),
    originalFeatureCount: matrix.featureNames.length,
    featureNames: matrix.featureNames,
  };
}
