/**
 * Trace clustering — group similar traces using k-means or DBSCAN.
 */

import { kmeans, dbscan } from 'micro-ml';
import { buildFeatureMatrix } from './bridge.js';
import type { ClusteringMethod, ClusteringResult } from './types.js';

/**
 * Cluster traces by similarity using ML algorithms.
 *
 * @param featuresJson - Array of feature objects from wasm.extract_case_features()
 * @param options - Clustering configuration
 */
export async function clusterTraces(
  featuresJson: Array<Record<string, unknown>>,
  options: {
    method?: ClusteringMethod;
    k?: number;
    eps?: number;
    minPoints?: number;
  } = {},
): Promise<ClusteringResult> {
  const method = options.method ?? 'kmeans';
  const matrix = buildFeatureMatrix(featuresJson);

  if (matrix.data.length === 0) {
    return {
      method,
      clusterCount: 0,
      noiseCount: 0,
      assignments: [],
      modelInfo: { error: 'No features available' },
    };
  }

  if (method === 'dbscan') {
    const model = await dbscan(matrix.data, {
      eps: options.eps ?? 1.0,
      minPoints: options.minPoints ?? 3,
    });
    const labels = model.getLabels();
    const nClusters = new Set(labels.filter(l => l >= 0)).size;
    const nNoise = labels.filter(l => l < 0).length;

    return {
      method: 'dbscan',
      clusterCount: nClusters,
      noiseCount: nNoise,
      assignments: matrix.caseIds.map((caseId, i) => ({
        caseId,
        cluster: labels[i],
      })),
      modelInfo: {
        eps: options.eps ?? 1.0,
        minPoints: options.minPoints ?? 3,
        featureCount: matrix.featureNames.length,
        traceCount: matrix.data.length,
      },
    };
  }

  // kmeans
  const k = Math.min(options.k ?? 3, matrix.data.length);
  const model = await kmeans(matrix.data, { k });
  const assignments = model.getAssignments();
  const centroids = model.getCentroids();

  return {
    method: 'kmeans',
    clusterCount: k,
    noiseCount: 0,
    assignments: matrix.caseIds.map((caseId, i) => ({
      caseId,
      cluster: assignments[i],
    })),
    centroids,
    modelInfo: {
      k,
      inertia: model.inertia,
      iterations: model.iterations,
      featureCount: matrix.featureNames.length,
      traceCount: matrix.data.length,
    },
  };
}
