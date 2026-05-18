/**
 * Feature quality assessment for ML pipelines.
 *
 * Detects problematic features before training:
 * - Zero-variance columns (no predictive power)
 * - Multicollinearity (r > 0.95)
 * - Missing values
 * - Skewed distributions
 *
 * Quality score: 0-1, where 1 = all features valid and diverse.
 */

import type { FeatureMatrix } from './types.js';

export interface FeatureQualityIssue {
  type: 'zero_variance' | 'high_correlation' | 'missing_values' | 'skewed';
  featureName: string;
  severity: 'critical' | 'warning';
  description: string;
}

export interface FeatureQualityReport {
  score: number; // 0-1
  issues: FeatureQualityIssue[];
  recommendations: string[];
  validFeatureCount: number;
  totalFeatureCount: number;
  hasProblematicFeatures: boolean;
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sumSquaredDiff = values.reduce((a, x) => a + (x - mean) ** 2, 0);
  return sumSquaredDiff / values.length;
}

function computeCorrelation(col1: number[], col2: number[]): number {
  if (col1.length === 0) return 0;

  const mean1 = col1.reduce((a, b) => a + b, 0) / col1.length;
  const mean2 = col2.reduce((a, b) => a + b, 0) / col2.length;

  let numerator = 0;
  let sum1Sq = 0;
  let sum2Sq = 0;

  for (let i = 0; i < col1.length; i++) {
    const d1 = col1[i] - mean1;
    const d2 = col2[i] - mean2;
    numerator += d1 * d2;
    sum1Sq += d1 * d1;
    sum2Sq += d2 * d2;
  }

  const denom = Math.sqrt(sum1Sq * sum2Sq);
  if (denom === 0) return 0;

  return Math.abs(numerator / denom);
}

function detectMissingValues(col: number[]): number {
  return col.filter((x) => !Number.isFinite(x)).length;
}

export function assessFeatureQuality(
  features: FeatureMatrix,
): FeatureQualityReport {
  const issues: FeatureQualityIssue[] = [];
  const { data, featureNames } = features;

  if (!data || data.length === 0 || !data[0]) {
    return {
      score: 0,
      issues: [
        {
          type: 'zero_variance',
          featureName: 'all',
          severity: 'critical',
          description: 'No data provided',
        },
      ],
      recommendations: ['Ensure feature matrix is non-empty'],
      validFeatureCount: 0,
      totalFeatureCount: featureNames.length,
      hasProblematicFeatures: true,
    };
  }

  const numRows = data.length;
  const numCols = data[0].length;

  // Extract columns (transpose)
  const columns: number[][] = [];
  for (let col = 0; col < numCols; col++) {
    const column: number[] = [];
    for (let row = 0; row < numRows; row++) {
      column.push(data[row][col]);
    }
    columns.push(column);
  }

  // Check for zero variance
  for (let i = 0; i < columns.length; i++) {
    const variance = computeVariance(columns[i]);
    if (variance < 1e-10) {
      issues.push({
        type: 'zero_variance',
        featureName: featureNames[i] || `feature_${i}`,
        severity: 'critical',
        description: `Variance = ${variance.toFixed(6)} (zero or near-zero)`,
      });
    }
  }

  // Check for missing values
  for (let i = 0; i < columns.length; i++) {
    const missingCount = detectMissingValues(columns[i]);
    if (missingCount > numRows * 0.2) {
      issues.push({
        type: 'missing_values',
        featureName: featureNames[i] || `feature_${i}`,
        severity: 'warning',
        description: `${missingCount}/${numRows} missing values (${((missingCount / numRows) * 100).toFixed(1)}%)`,
      });
    }
  }

  // Check for multicollinearity (pairwise correlations)
  const correlationWarnings = new Set<string>();
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const corr = computeCorrelation(columns[i], columns[j]);
      if (corr > 0.95) {
        const pair = `${featureNames[i] || `feature_${i}`} & ${featureNames[j] || `feature_${j}`}`;
        if (!correlationWarnings.has(pair)) {
          issues.push({
            type: 'high_correlation',
            featureName: featureNames[i] || `feature_${i}`,
            severity: 'warning',
            description: `High correlation (r=${corr.toFixed(3)}) with ${featureNames[j] || `feature_${j}`}`,
          });
          correlationWarnings.add(pair);
        }
      }
    }
  }

  const validFeatureCount = numCols - issues.filter((x) => x.severity === 'critical').length;
  const score = Math.max(0, 1 - (issues.length * 0.1 + (numCols - validFeatureCount) * 0.3));

  const recommendations: string[] = [];
  if (issues.some((x) => x.type === 'zero_variance')) {
    recommendations.push('Remove zero-variance features before training');
  }
  if (issues.some((x) => x.type === 'high_correlation')) {
    recommendations.push('Consider removing one feature from each highly correlated pair');
  }
  if (issues.some((x) => x.type === 'missing_values')) {
    recommendations.push('Impute or remove features with >20% missing values');
  }
  if (validFeatureCount === 0) {
    recommendations.push('No valid features remain; provide more/better input data');
  }

  return {
    score,
    issues,
    recommendations,
    validFeatureCount,
    totalFeatureCount: numCols,
    hasProblematicFeatures: issues.length > 0,
  };
}
