/**
 * Feature Quality Assessment Module
 *
 * Evaluates numeric feature matrices for:
 * - Zero-variance columns (waste dimensions)
 * - Multicollinearity (correlated features corrupt regression)
 * - Insufficient samples
 *
 * Returns quality score (0-1) + actionable warnings.
 */

export interface QualityReport {
  qualityScore: number; // 0-1, higher is better
  zeroVarianceColumns: number;
  correlatedPairs: Array<{ col1: number; col2: number; correlation: number }>;
  warnings: string[];
  recommendations: string[];
}

/**
 * Compute variance (standard deviation squared) for a column.
 */
function computeVariance(column: number[]): number {
  if (column.length === 0) return 0;
  const mean = column.reduce((a, b) => a + b, 0) / column.length;
  const sumSquaredDiff = column.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  return sumSquaredDiff / column.length;
}

/**
 * Compute Pearson correlation coefficient between two columns.
 */
function computeCorrelation(col1: number[], col2: number[]): number {
  if (col1.length !== col2.length || col1.length === 0) return 0;

  const mean1 = col1.reduce((a, b) => a + b, 0) / col1.length;
  const mean2 = col2.reduce((a, b) => a + b, 0) / col2.length;

  let covariance = 0;
  let sumSq1 = 0;
  let sumSq2 = 0;

  for (let i = 0; i < col1.length; i++) {
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
 * Assess feature quality for a numeric feature matrix.
 *
 * Quality scoring (0-1):
 * - Start at 1.0
 * - If >20% columns are zero-variance: -0.4
 * - If max correlation > 0.95: -0.2 per pair (capped at -0.3)
 * - If <10 samples: -0.1
 *
 * @param features - Numeric feature matrix (rows = samples, cols = features)
 * @returns QualityReport with score, warnings, and recommendations
 */
export function assessFeatureQuality(features: number[][]): QualityReport {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let qualityScore = 1.0;

  // Edge case: empty or single-sample data
  if (!features || features.length === 0) {
    warnings.push('No features provided');
    return {
      qualityScore: 0,
      zeroVarianceColumns: 0,
      correlatedPairs: [],
      warnings,
      recommendations: ['Provide valid feature data with at least 3 samples'],
    };
  }

  const numRows = features.length;
  const numCols = features[0]?.length ?? 0;

  if (numCols === 0) {
    warnings.push('No feature columns found');
    return {
      qualityScore: 0,
      zeroVarianceColumns: 0,
      correlatedPairs: [],
      warnings,
      recommendations: ['Provide feature matrix with at least one column'],
    };
  }

  // Transpose to analyze columns
  const columns: number[][] = Array(numCols)
    .fill(null)
    .map((_, colIdx) => features.map((row) => row[colIdx]));

  // Check variance
  const variances = columns.map(computeVariance);
  const zeroVarianceCount = variances.filter((v) => v < 1e-10).length;
  const zeroVarianceRatio = zeroVarianceCount / numCols;

  if (zeroVarianceCount > 0) {
    warnings.push(`${zeroVarianceCount} zero-variance column(s) detected`);
    recommendations.push(`Remove or engineer ${zeroVarianceCount} feature(s) with zero variance`);
  }

  if (zeroVarianceRatio > 0.2) {
    qualityScore -= 0.4;
    warnings.push(`>20% columns are zero-variance (${(zeroVarianceRatio * 100).toFixed(1)}%)`);
  }

  // Check correlations
  const correlatedPairs: Array<{ col1: number; col2: number; correlation: number }> = [];
  let correlationPenalty = 0;

  for (let i = 0; i < numCols; i++) {
    for (let j = i + 1; j < numCols; j++) {
      const corr = Math.abs(computeCorrelation(columns[i], columns[j]));
      if (corr > 0.95) {
        correlatedPairs.push({ col1: i, col2: j, correlation: corr });
        correlationPenalty -= 0.2;
      }
    }
  }

  // Cap correlation penalty at -0.3
  if (correlationPenalty < -0.3) {
    correlationPenalty = -0.3;
  }
  qualityScore += correlationPenalty;

  if (correlatedPairs.length > 0) {
    warnings.push(`${correlatedPairs.length} highly correlated feature pair(s) (r > 0.95)`);
    recommendations.push('Remove or combine highly correlated features to improve stability');
  }

  // Check sample size
  if (numRows < 10) {
    qualityScore -= 0.1;
    warnings.push(`Only ${numRows} samples (recommend ≥10 for model stability)`);
    recommendations.push(`Gather more data; current sample is too small for reliable ML`);
  }

  // Clamp score to [0, 1]
  qualityScore = Math.max(0, Math.min(1, qualityScore));

  return {
    qualityScore,
    zeroVarianceColumns: zeroVarianceCount,
    correlatedPairs,
    warnings,
    recommendations,
  };
}
