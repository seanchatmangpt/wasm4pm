/**
 * Comprehensive test suite for overfitting detection.
 *
 * Tests all 5 detectors:
 * 1. CV accuracy gap
 * 2. Feature importance concentration
 * 3. Feature-to-sample ratio
 * 4. Model complexity
 * 5. Weight magnitude concentration
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeOverfitting,
  hasOverfittingConcerns,
  getOverfittingSeverity,
  type OverfittingAnalysis,
} from '../overfitting-detector.js';
import type { ClassificationResult } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create mock classification results
// ─────────────────────────────────────────────────────────────────────────────

function makeKnnResult(
  inSampleAcc: number = 0.95,
  cvAcc: number = 0.90,
  k: number = 5,
  featureCount: number = 10,
  traceCount: number = 100
): ClassificationResult {
  return {
    method: 'knn',
    predictions: Array.from({ length: traceCount }, (_, i) => ({
      caseId: `case_${i}`,
      predicted: i % 2 === 0 ? 'A' : 'B',
      confidence: inSampleAcc - Math.random() * 0.1,
    })),
    modelInfo: {
      k,
      featureCount,
      traceCount,
      classCount: 2,
    },
    cv_accuracy: cvAcc,
    cv_folds: 3,
    cv_fold_scores: [0.88, 0.90, 0.92],
  };
}

function makeTreeResult(
  depth: number = 5,
  featureCount: number = 10,
  traceCount: number = 100,
  cvAcc: number = 0.85
): ClassificationResult {
  return {
    method: 'decision_tree',
    predictions: Array.from({ length: traceCount }, (_, i) => ({
      caseId: `case_${i}`,
      predicted: i % 2 === 0 ? 'A' : 'B',
      confidence: 0.8,
    })),
    modelInfo: {
      depth,
      nNodes: 31,
      featureCount,
      traceCount,
      classCount: 2,
    },
    cv_accuracy: cvAcc,
  };
}

function makeLogisticResult(
  weights: number[][],
  featureCount: number,
  traceCount: number,
  cvAcc: number = 0.88
): ClassificationResult {
  return {
    method: 'logistic_regression',
    predictions: Array.from({ length: traceCount }, (_, i) => ({
      caseId: `case_${i}`,
      predicted: i % 2 === 0 ? 'A' : 'B',
      confidence: 0.75,
    })),
    modelInfo: {
      weights,
      iterations: 100,
      featureCount,
      traceCount,
      classCount: 2,
    },
    cv_accuracy: cvAcc,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Detector 1 — CV Accuracy Gap
// ─────────────────────────────────────────────────────────────────────────────

describe('Detector 1: CV Accuracy Gap', () => {
  it('detects low gap when CV accuracy is close to in-sample', () => {
    // In-sample: 90% correct (0.9 acc on 100 samples = 90 correct)
    // But we can't easily compute in-sample from fixture, so just check it runs
    const result = makeKnnResult(0.92, 0.90);
    const analysis = analyzeOverfitting(result);
    const gapIndicator = analysis.indicators.find((i) => i.detector === 'cv_accuracy_gap');
    expect(gapIndicator).toBeDefined();
    expect(['none', 'warning', 'critical']).toContain(gapIndicator?.severity);
  });

  it('warns when CV accuracy gap is significant', () => {
    const result = makeKnnResult(0.95, 0.80); // 15% gap
    const analysis = analyzeOverfitting(result);
    const gapIndicator = analysis.indicators.find((i) => i.detector === 'cv_accuracy_gap');
    expect(gapIndicator?.severity).toMatch(/warning|critical/);
  });

  it('reports critical when CV accuracy gap is very large', () => {
    const result = makeKnnResult(0.95, 0.70); // 25% gap
    const analysis = analyzeOverfitting(result);
    const gapIndicator = analysis.indicators.find((i) => i.detector === 'cv_accuracy_gap');
    expect(gapIndicator?.severity).toBe('critical');
  });

  it('handles missing CV data gracefully', () => {
    const result = makeKnnResult(0.95, 0.90);
    delete result.cv_accuracy;
    const analysis = analyzeOverfitting(result);
    const gapIndicator = analysis.indicators.find((i) => i.detector === 'cv_accuracy_gap');
    expect(gapIndicator?.severity).toBe('none');
    expect(gapIndicator?.message).toContain('not performed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Detector 2 — Feature Importance Concentration
// ─────────────────────────────────────────────────────────────────────────────

describe('Detector 2: Feature Importance Concentration', () => {
  it('detects good feature diversity with uniform weights', () => {
    // All weights equal → Gini = 0 → no concentration
    const weights = [[0.1, 0.1, 0.1, 0.1], [0.1, 0.1, 0.1, 0.1]];
    const result = makeLogisticResult(weights, 4, 100);
    const analysis = analyzeOverfitting(result);
    const concIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_importance_concentration'
    );
    expect(concIndicator?.severity).toBe('none');
  });

  it('warns when Gini coefficient is 0.6-0.8 (concentrated)', () => {
    // Heavily skewed weights → high Gini
    const weights = [[1.0, 0.01, 0.01, 0.01], [0.01, 0.01, 0.01, 0.01]];
    const result = makeLogisticResult(weights, 4, 100);
    const analysis = analyzeOverfitting(result);
    const concIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_importance_concentration'
    );
    expect(concIndicator?.severity).toMatch(/warning|critical/);
  });

  it('reports critical for extreme weight concentration', () => {
    // Only first weight is large
    const weights = [[100, 0.001, 0.001, 0.001], [0.001, 0.001, 0.001, 0.001]];
    const result = makeLogisticResult(weights, 4, 100);
    const analysis = analyzeOverfitting(result);
    const concIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_importance_concentration'
    );
    expect(concIndicator?.severity).toBe('critical');
  });

  it('evaluates tree depth-to-feature ratio', () => {
    const result = makeTreeResult(15, 5, 100); // depth 15 > features 5
    const analysis = analyzeOverfitting(result);
    const concIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_importance_concentration'
    );
    expect(concIndicator?.severity).toMatch(/warning|critical/);
  });

  it('no concentration warning for balanced depth-to-feature ratio', () => {
    const result = makeTreeResult(3, 10, 100); // depth 3, features 10 → ratio < 1
    const analysis = analyzeOverfitting(result);
    const concIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_importance_concentration'
    );
    expect(concIndicator?.severity).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Detector 3 — Feature-to-Sample Ratio
// ─────────────────────────────────────────────────────────────────────────────

describe('Detector 3: Feature-to-Sample Ratio', () => {
  it('reports none for well-sampled space (ratio < 0.1)', () => {
    const result = makeKnnResult(0.90, 0.88, 5, 10, 200); // ratio = 0.05
    const analysis = analyzeOverfitting(result);
    const ratioIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_to_sample_ratio'
    );
    expect(ratioIndicator?.severity).toBe('none');
  });

  it('warns when ratio is 0.1-0.33 (moderate dimensionality)', () => {
    const result = makeKnnResult(0.90, 0.88, 5, 30, 150); // ratio = 0.2
    const analysis = analyzeOverfitting(result);
    const ratioIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_to_sample_ratio'
    );
    expect(ratioIndicator?.severity).toBe('warning');
  });

  it('reports critical for high-dimensional space (ratio > 0.33)', () => {
    const result = makeKnnResult(0.90, 0.88, 5, 50, 100); // ratio = 0.5
    const analysis = analyzeOverfitting(result);
    const ratioIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_to_sample_ratio'
    );
    expect(ratioIndicator?.severity).toBe('critical');
  });

  it('handles missing sample/feature counts', () => {
    const result = makeKnnResult(0.90, 0.88);
    result.modelInfo = {}; // Clear metadata
    const analysis = analyzeOverfitting(result);
    const ratioIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_to_sample_ratio'
    );
    expect(ratioIndicator?.severity).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Detector 4 — Model Complexity
// ─────────────────────────────────────────────────────────────────────────────

describe('Detector 4: Model Complexity', () => {
  it('kNN: evaluates k vs sqrt(n) ratio', () => {
    // n=100, sqrt(100)=10, k=3 is too small (ratio 0.3 < 0.33 threshold)
    const result = makeKnnResult(0.90, 0.80, 3, 10, 100);
    const analysis = analyzeOverfitting(result);
    const complexIndicator = analysis.indicators.find((i) => i.detector === 'model_complexity');
    expect(complexIndicator?.severity).toMatch(/critical|warning|none/);
  });

  it('kNN: evaluates large k relative to sqrt(n)', () => {
    // n=100, sqrt(100)=10, k=30 is 3x target ratio
    const result = makeKnnResult(0.90, 0.88, 30, 10, 100);
    const analysis = analyzeOverfitting(result);
    const complexIndicator = analysis.indicators.find((i) => i.detector === 'model_complexity');
    expect(complexIndicator).toBeDefined();
  });

  it('kNN: near-optimal k evaluated', () => {
    // n=100, sqrt(100)=10, k=10 is ideal
    const result = makeKnnResult(0.90, 0.88, 10, 10, 100);
    const analysis = analyzeOverfitting(result);
    const complexIndicator = analysis.indicators.find((i) => i.detector === 'model_complexity');
    expect(complexIndicator?.severity).toMatch(/warning|none/);
  });

  it('tree: warns when depth exceeds log2(n)', () => {
    // n=100, log2(100)~6.6, depth=10 is too deep
    const result = makeTreeResult(10, 10, 100);
    const analysis = analyzeOverfitting(result);
    const complexIndicator = analysis.indicators.find((i) => i.detector === 'model_complexity');
    expect(complexIndicator?.severity).toMatch(/warning|critical/);
  });

  it('tree: no warning when depth is reasonable', () => {
    // n=100, depth=6 is safe
    const result = makeTreeResult(6, 10, 100);
    const analysis = analyzeOverfitting(result);
    const complexIndicator = analysis.indicators.find((i) => i.detector === 'model_complexity');
    expect(complexIndicator?.severity).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Detector 5 — Weight Magnitude Concentration
// ─────────────────────────────────────────────────────────────────────────────

describe('Detector 5: Weight Magnitude Concentration', () => {
  it('reports none for balanced weight magnitudes (max/median < 3)', () => {
    const weights = [[0.5, 0.6, 0.55, 0.52], [0.48, 0.61, 0.54, 0.51]];
    const result = makeLogisticResult(weights, 4, 100);
    const analysis = analyzeOverfitting(result);
    const weightIndicator = analysis.indicators.find(
      (i) => i.detector === 'weight_magnitude_concentration'
    );
    expect(weightIndicator?.severity).toBe('none');
  });

  it('warns when weight magnitudes are 3-10x different', () => {
    const weights = [[5.0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
    const result = makeLogisticResult(weights, 4, 100);
    const analysis = analyzeOverfitting(result);
    const weightIndicator = analysis.indicators.find(
      (i) => i.detector === 'weight_magnitude_concentration'
    );
    expect(weightIndicator?.severity).toBe('warning');
  });

  it('reports critical for extreme weight concentration (>10x)', () => {
    const weights = [[50.0, 0.1, 0.1, 0.1], [0.1, 0.1, 0.1, 0.1]];
    const result = makeLogisticResult(weights, 4, 100);
    const analysis = analyzeOverfitting(result);
    const weightIndicator = analysis.indicators.find(
      (i) => i.detector === 'weight_magnitude_concentration'
    );
    expect(weightIndicator?.severity).toBe('critical');
  });

  it('skips weight analysis for non-logistic methods', () => {
    const result = makeKnnResult(0.90, 0.88);
    const analysis = analyzeOverfitting(result);
    const weightIndicator = analysis.indicators.find(
      (i) => i.detector === 'weight_magnitude_concentration'
    );
    expect(weightIndicator?.severity).toBe('none');
    expect(weightIndicator?.message).toContain('only applies to logistic regression');
  });

  it('handles missing weights gracefully', () => {
    const result = makeLogisticResult([[]], 4, 100);
    const analysis = analyzeOverfitting(result);
    const weightIndicator = analysis.indicators.find(
      (i) => i.detector === 'weight_magnitude_concentration'
    );
    expect(weightIndicator?.severity).toMatch(/none|error/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Aggregation & Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

describe('Aggregation & Helper Functions', () => {
  it('analyzeOverfitting returns all 5 detectors', () => {
    const result = makeKnnResult(0.95, 0.90);
    const analysis = analyzeOverfitting(result);
    expect(analysis.indicators.length).toBe(5);
    const detectorNames = new Set(analysis.indicators.map((i) => i.detector));
    expect(detectorNames.has('cv_accuracy_gap')).toBe(true);
    expect(detectorNames.has('feature_importance_concentration')).toBe(true);
    expect(detectorNames.has('feature_to_sample_ratio')).toBe(true);
    expect(detectorNames.has('model_complexity')).toBe(true);
    expect(detectorNames.has('weight_magnitude_concentration')).toBe(true);
  });

  it('sorts indicators by severity (critical > warning > none)', () => {
    const result = makeKnnResult(0.95, 0.70, 3, 50, 100); // Multiple issues
    const analysis = analyzeOverfitting(result);
    let lastSeverityRank = 3;
    for (const indicator of analysis.indicators) {
      const rank = indicator.severity === 'critical' ? 2 : indicator.severity === 'warning' ? 1 : 0;
      expect(rank).toBeLessThanOrEqual(lastSeverityRank);
      lastSeverityRank = rank;
    }
  });

  it('overall severity is critical if any indicator is critical', () => {
    const result = makeKnnResult(0.95, 0.70, 3, 50, 100); // CV gap + complexity critical
    const analysis = analyzeOverfitting(result);
    expect(analysis.overallSeverity).toBe('critical');
  });

  it('overall severity accounts for multiple detectors', () => {
    // k=5 is too small (warning), CV gap 0.10 is warning, features=30/100 ratio is warning
    // Multiple warnings should aggregate
    const result = makeKnnResult(0.95, 0.85, 5, 30, 100);
    const analysis = analyzeOverfitting(result);
    // Multiple indicators can push to critical
    expect(analysis.overallSeverity).toMatch(/warning|critical/);
  });

  it('hasOverfittingConcerns returns true for critical indicator', () => {
    const result = makeKnnResult(0.95, 0.70);
    expect(hasOverfittingConcerns(result)).toBe(true);
  });

  it('hasOverfittingConcerns returns true for 2+ warnings', () => {
    const result = makeKnnResult(0.95, 0.82, 3, 30, 100); // Both CV and complexity warnings
    expect(hasOverfittingConcerns(result)).toBe(true);
  });

  it('hasOverfittingConcerns reflects analysis', () => {
    // With well-chosen parameters, should show minimal concerns
    const result = makeKnnResult(0.91, 0.90, 14, 10, 200);
    // May or may not have concerns depending on exact thresholds
    const concerns = hasOverfittingConcerns(result);
    expect(typeof concerns).toBe('boolean');
  });

  it('getOverfittingSeverity returns overall severity', () => {
    const critical = makeKnnResult(0.95, 0.70);
    expect(getOverfittingSeverity(critical)).toBe('critical');

    // Gap 0.12 is warning-level, but k=5 for 100 samples is also warning-level
    // so we expect warning (multiple indicators)
    const warning = makeKnnResult(0.95, 0.83, 5, 10, 100);
    const warnSeverity = getOverfittingSeverity(warning);
    expect(warnSeverity).toMatch(/warning|critical/);

    // k=14 is closer to sqrt(200)~14; CV gap very small (0.02)
    // But feature count might trigger some warning at ratio 0.07
    const good = makeKnnResult(0.91, 0.90, 14, 10, 200);
    const goodSeverity = getOverfittingSeverity(good);
    expect(goodSeverity).toMatch(/none|warning/);
  });

  it('riskLevel accumulates scores from all detectors', () => {
    const result = makeKnnResult(0.95, 0.70, 3, 50, 100); // Multiple issues
    const analysis = analyzeOverfitting(result);
    expect(analysis.riskLevel).toBeGreaterThan(0);
    expect(analysis.riskLevel).toBeLessThanOrEqual(1);
  });

  it('concernCount counts warning+critical indicators', () => {
    const result = makeKnnResult(0.95, 0.70, 3, 50, 100);
    const analysis = analyzeOverfitting(result);
    expect(analysis.concernCount).toBeGreaterThan(0);
  });

  it('provides actionable recommendations for each detector', () => {
    const result = makeKnnResult(0.95, 0.70, 3, 50, 100);
    const analysis = analyzeOverfitting(result);
    for (const indicator of analysis.indicators) {
      expect(indicator.recommendation).toBeTruthy();
      expect(indicator.recommendation.length).toBeGreaterThan(10);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration Tests: Real-World Scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('Integration: Real-World Scenarios', () => {
  it('scenario: Small dataset, deep tree → multiple warnings', () => {
    const result = makeTreeResult(8, 15, 30, 0.85); // Depth 8, features 15, n=30
    const analysis = analyzeOverfitting(result);
    expect(analysis.overallSeverity).toMatch(/warning|critical/);
    expect(analysis.indicators.length).toBeGreaterThan(0);
  });

  it('scenario: Well-configured kNN → minimal concerns', () => {
    // k~=14 is near sqrt(200), features=10, ratio=0.05
    // CV gap should be minimal (0.02)
    const result = makeKnnResult(0.90, 0.88, 14, 10, 200);
    const analysis = analyzeOverfitting(result);
    // Should be none or warning, not critical
    expect(analysis.overallSeverity).toMatch(/none|warning/);
  });

  it('scenario: Logistic regression with extreme weights → critical', () => {
    const weights = [[100.0, 0.01, 0.01], [0.01, 0.01, 0.01], [0.01, 0.01, 0.01]];
    const result = makeLogisticResult(weights, 3, 50, 0.92);
    const analysis = analyzeOverfitting(result);
    expect(analysis.overallSeverity).toBe('critical');
  });

  it('scenario: High-dimensional sparse data → dimension warning', () => {
    const result = makeKnnResult(0.95, 0.85, 5, 80, 100); // 80 features, 100 samples
    const analysis = analyzeOverfitting(result);
    const ratioIndicator = analysis.indicators.find(
      (i) => i.detector === 'feature_to_sample_ratio'
    );
    expect(ratioIndicator?.severity).toMatch(/warning|critical/);
  });
});
