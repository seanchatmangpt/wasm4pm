import { describe, it, expect } from 'vitest';
import { suggestParameters, pickBestAlgorithm } from '../parameter-suggestions.js';
import type { FeatureMatrix } from '../types.js';

describe('suggestParameters', () => {
  const smallDataset: FeatureMatrix = {
    data: Array.from({ length: 50 }, (_, i) => [i, i * 2]),
    featureNames: ['f1', 'f2'],
    caseIds: Array.from({ length: 50 }, (_, i) => `c${i}`),
    targets: [],
    labels: [],
  };

  const largeDataset: FeatureMatrix = {
    data: Array.from({ length: 15000 }, (_, i) => [i, i * 2]),
    featureNames: ['f1', 'f2'],
    caseIds: Array.from({ length: 15000 }, (_, i) => `c${i}`),
    targets: [],
    labels: [],
  };

  const highDimensional: FeatureMatrix = {
    data: Array.from({ length: 500 }, (_, i) =>
      Array.from({ length: 100 }, (_, j) => i + j),
    ),
    featureNames: Array.from({ length: 100 }, (_, i) => `f${i}`),
    caseIds: Array.from({ length: 500 }, (_, i) => `c${i}`),
    targets: [],
    labels: [],
  };

  it('suggests classification algorithms', () => {
    const result = suggestParameters(smallDataset);
    expect(result.classification.length).toBeGreaterThan(0);
    expect(result.classification[0].name).toBeDefined();
    expect(result.classification[0].confidence).toBeGreaterThan(0);
    expect(result.classification[0].confidence).toBeLessThanOrEqual(1);
  });

  it('suggests regression algorithms', () => {
    const result = suggestParameters(smallDataset);
    expect(result.regression.length).toBeGreaterThan(0);
    expect(result.regression[0].name).toBeDefined();
  });

  it('suggests clustering algorithms', () => {
    const result = suggestParameters(smallDataset);
    expect(result.clustering.length).toBeGreaterThan(0);
    expect(result.clustering[0].name).toBeDefined();
  });

  it('recommends decision tree for small datasets', () => {
    const result = suggestParameters(smallDataset);
    const decisionTree = result.classification.find((s) => s.name === 'decision_tree');
    expect(decisionTree).toBeDefined();
    expect(decisionTree!.confidence).toBeGreaterThan(0.8);
  });

  it('suggests appropriate k for k-NN', () => {
    const result = suggestParameters(smallDataset);
    const knn = result.classification.find((s) => s.name === 'knn');
    if (knn) {
      expect(knn.suggestedParameters.k).toBeGreaterThan(0);
      expect(knn.suggestedParameters.k).toBeLessThanOrEqual(smallDataset.data.length - 1);
    }
  });

  it('adjusts parameters for large datasets', () => {
    const result = suggestParameters(largeDataset);
    const decisionTree = result.classification.find((s) => s.name === 'decision_tree');
    const smallResult = suggestParameters(smallDataset);
    const smallDecisionTree = smallResult.classification.find((s) => s.name === 'decision_tree');

    if (decisionTree && smallDecisionTree) {
      const largeDepth = (decisionTree.suggestedParameters.maxDepth as number) || 0;
      const smallDepth = (smallDecisionTree.suggestedParameters.maxDepth as number) || 0;
      // Larger dataset can handle deeper trees
      expect(largeDepth).toBeGreaterThanOrEqual(smallDepth);
    }
  });

  it('recommends naive_bayes for high-dimensional data', () => {
    const result = suggestParameters(highDimensional);
    const naiveBayes = result.classification.find((s) => s.name === 'naive_bayes');
    expect(naiveBayes).toBeDefined();
  });

  it('suggests reasonable k-means cluster count', () => {
    const result = suggestParameters(smallDataset);
    const kmeans = result.clustering.find((s) => s.name === 'kmeans');
    expect(kmeans).toBeDefined();
    if (kmeans) {
      const k = kmeans.suggestedParameters.clusters as number;
      expect(k).toBeGreaterThan(1);
      expect(k).toBeLessThan(smallDataset.data.length);
    }
  });

  it('includes polynomial regression for larger datasets', () => {
    const result = suggestParameters(largeDataset);
    const poly = result.regression.find((s) => s.name === 'polynomial_regression');
    expect(poly).toBeDefined();
  });

  it('provides reasons for suggestions', () => {
    const result = suggestParameters(smallDataset);
    expect(result.classification[0].reason).toBeTruthy();
    expect(result.regression[0].reason).toBeTruthy();
    expect(result.clustering[0].reason).toBeTruthy();
  });
});

describe('pickBestAlgorithm', () => {
  const dataset: FeatureMatrix = {
    data: Array.from({ length: 100 }, (_, i) => [i, i * 2]),
    featureNames: ['f1', 'f2'],
    caseIds: Array.from({ length: 100 }, (_, i) => `c${i}`),
    targets: [],
    labels: [],
  };

  it('picks best classification algorithm', () => {
    const best = pickBestAlgorithm('classification', dataset);
    expect(['knn', 'logistic_regression', 'decision_tree', 'naive_bayes', 'gradient_boosting']).toContain(best);
  });

  it('picks best regression algorithm', () => {
    const best = pickBestAlgorithm('regression', dataset);
    expect(['linear_regression', 'polynomial_regression', 'exponential_regression']).toContain(
      best,
    );
  });

  it('picks best clustering algorithm', () => {
    const best = pickBestAlgorithm('clustering', dataset);
    expect(['kmeans', 'dbscan']).toContain(best);
  });
});
