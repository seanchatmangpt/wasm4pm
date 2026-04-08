/**
 * Classification and regression — trace outcome prediction,
 * remaining time regression using micro-ml models.
 */

import {
  knnClassifier,
  logisticRegression,
  linearRegression,
  decisionTree,
  naiveBayes,
  polynomialRegression,
  exponentialRegression,
  rmse,
  mae,
} from 'micro-ml';
import { buildFeatureMatrix, encodeLabels } from './bridge.js';
import type {
  ClassificationMethod,
  ClassificationResult,
  RegressionMethod,
  RegressionResult,
} from './types.js';

/**
 * Classify traces using k-NN, logistic regression, decision tree, or naive Bayes.
 *
 * @param featuresJson - Array of feature objects from wasm.extract_case_features()
 * @param options - Classification configuration
 */
export async function classifyTraces(
  featuresJson: Array<Record<string, unknown>>,
  options: {
    targetKey?: string;
    method?: ClassificationMethod;
    k?: number;
    maxDepth?: number;
  } = {},
): Promise<ClassificationResult> {
  const targetKey = options.targetKey ?? 'outcome';
  const method = options.method ?? 'knn';
  const matrix = buildFeatureMatrix(featuresJson, undefined, targetKey);

  if (matrix.data.length === 0 || matrix.labels.length === 0) {
    return {
      method,
      predictions: [],
      modelInfo: { error: 'No features or labels available' },
    };
  }

  const { encoded, reverseMap } = encodeLabels(matrix.labels);

  if (method === 'knn') {
    const model = await knnClassifier(matrix.data, encoded, {
      k: options.k ?? 5,
    });
    const predictions = model.predict(matrix.data);
    const probas = model.predictProba(matrix.data);

    return {
      method: 'knn',
      predictions: matrix.caseIds.map((caseId, i) => ({
        caseId,
        predicted: reverseMap.get(predictions[i]) ?? 'unknown',
        confidence: Array.isArray(probas[i])
          ? Math.max(...probas[i])
          : (probas[i] as number),
      })),
      modelInfo: {
        k: options.k ?? 5,
        featureCount: matrix.featureNames.length,
        traceCount: matrix.data.length,
        classCount: reverseMap.size,
      },
    };
  }

  if (method === 'logistic_regression') {
    const model = await logisticRegression(matrix.data, encoded);
    const predictions = model.predict(matrix.data);
    const probas = model.predictProba(matrix.data);

    return {
      method: 'logistic_regression',
      predictions: matrix.caseIds.map((caseId, i) => ({
        caseId,
        predicted: reverseMap.get(predictions[i]) ?? 'unknown',
        confidence: Array.isArray(probas[i])
          ? Math.max(...probas[i])
          : (probas[i] as number),
      })),
      modelInfo: {
        weights: model.getWeights(),
        iterations: model.iterations,
        featureCount: matrix.featureNames.length,
        traceCount: matrix.data.length,
        classCount: reverseMap.size,
      },
    };
  }

  if (method === 'decision_tree') {
    const model = await decisionTree(matrix.data, encoded, {
      maxDepth: options.maxDepth ?? 5,
    });
    const predictions = model.predict(matrix.data);

    return {
      method: 'decision_tree',
      predictions: matrix.caseIds.map((caseId, i) => ({
        caseId,
        predicted: reverseMap.get(predictions[i]) ?? 'unknown',
        confidence: 1,
      })),
      modelInfo: {
        depth: model.depth,
        nNodes: model.nNodes,
        featureCount: matrix.featureNames.length,
        traceCount: matrix.data.length,
        classCount: reverseMap.size,
      },
    };
  }

  // naive_bayes (fallback)
  const model = await naiveBayes(matrix.data, encoded);
  const predictions = model.predict(matrix.data);
  const probas = model.predictProba(matrix.data);

  return {
    method: 'naive_bayes',
    predictions: matrix.caseIds.map((caseId, i) => ({
      caseId,
      predicted: reverseMap.get(predictions[i]) ?? 'unknown',
      confidence: Array.isArray(probas[i])
        ? Math.max(...probas[i])
        : (probas[i] as number),
    })),
    modelInfo: {
      nClasses: model.nClasses,
      nFeatures: model.nFeatures,
      featureCount: matrix.featureNames.length,
      traceCount: matrix.data.length,
      classCount: reverseMap.size,
    },
  };
}

/**
 * Predict remaining case time using regression on trace features.
 *
 * Supports linear, polynomial, and exponential regression.
 *
 * @param featuresJson - Array of feature objects with numeric target (remaining_time)
 */
export async function regressRemainingTime(
  featuresJson: Array<Record<string, unknown>>,
  options: {
    targetKey?: string;
    method?: RegressionMethod;
    degree?: number;
  } = {},
): Promise<RegressionResult> {
  const targetKey = options.targetKey ?? 'remaining_time';
  const method = options.method ?? 'linear_regression';
  const matrix = buildFeatureMatrix(featuresJson, targetKey);

  if (matrix.data.length < 2) {
    throw new Error('Not enough traces for regression (need at least 2)');
  }

  // Use first feature as predictor for univariate regression
  const x = matrix.data.map(row => row[0] ?? 0);
  const y = matrix.targets;

  if (method === 'polynomial_regression') {
    const degree = options.degree ?? 2;
    const model = await polynomialRegression(x, y, { degree });
    const predicted = model.predict(x);

    return {
      method: 'polynomial_regression',
      rSquared: model.rSquared,
      rmse: rmse(y, predicted),
      mae: mae(y, predicted),
      predictions: matrix.caseIds.map((caseId, i) => ({
        caseId,
        actual: y[i],
        predicted: predicted[i],
      })),
      degree,
      coefficients: model.getCoefficients(),
    };
  }

  if (method === 'exponential_regression') {
    const model = await exponentialRegression(x, y);
    const predicted = model.predict(x);

    return {
      method: 'exponential_regression',
      rSquared: model.rSquared,
      rmse: rmse(y, predicted),
      mae: mae(y, predicted),
      predictions: matrix.caseIds.map((caseId, i) => ({
        caseId,
        actual: y[i],
        predicted: predicted[i],
      })),
      growthRate: model.b,
      amplitude: model.a,
      doublingTime: model.doublingTime(),
    };
  }

  // linear_regression (default)
  const model = await linearRegression(x, y);
  const predicted = x.map(xi => model.predict([xi])[0]);

  return {
    method: 'linear_regression',
    slope: model.slope,
    intercept: model.intercept,
    rSquared: model.rSquared,
    rmse: rmse(y, predicted),
    mae: mae(y, predicted),
    predictions: matrix.caseIds.map((caseId, i) => ({
      caseId,
      actual: y[i],
      predicted: predicted[i],
    })),
  };
}
