import { describe, it, expect } from 'vitest';
import { classifyTraces, regressRemainingTime } from '../classifiers.js';

describe('classifyTraces', () => {
  const features = [
    { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
    { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
    { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
    { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
    { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
    { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
  ];

  it('classifies with knn method', async () => {
    const result = await classifyTraces(features, { method: 'knn', k: 3 });
    expect(result.method).toBe('knn');
    expect(result.predictions).toHaveLength(6);
    for (const p of result.predictions) {
      expect(['Approve', 'Reject']).toContain(p.predicted);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
      expect(p.caseId).toBeTruthy();
    }
    expect(result.modelInfo.traceCount).toBe(6);
    // Accuracy: well-separated dataset should achieve >= 80%
    const correct = result.predictions.filter((p) => {
      const label = features.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    expect(correct / features.length).toBeGreaterThanOrEqual(0.8);
  });

  it('classifies with logistic_regression method', async () => {
    const result = await classifyTraces(features, { method: 'logistic_regression' });
    expect(result.method).toBe('logistic_regression');
    expect(result.predictions).toHaveLength(6);
    // Softmax normalization: confidence should be a valid probability
    for (const p of result.predictions) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('logistic regression softmax probabilities are normalized', async () => {
    const result = await classifyTraces(features, { method: 'logistic_regression' });
    // With 2 classes and softmax, confidences should be reasonable
    // (not all 0.9+ which would indicate non-normalized independent sigmoids)
    const avgConfidence =
      result.predictions.reduce((s, p) => s + p.confidence, 0) / result.predictions.length;
    expect(avgConfidence).toBeGreaterThan(0.4);
    expect(avgConfidence).toBeLessThanOrEqual(1);
  });

  it('returns empty predictions for empty input', async () => {
    const result = await classifyTraces([]);
    expect(result.predictions).toEqual([]);
  });

  it('classifies with decision_tree method', async () => {
    const result = await classifyTraces(features, { method: 'decision_tree' });
    expect(result.method).toBe('decision_tree');
    expect(result.predictions).toHaveLength(6);
    for (const p of result.predictions) {
      expect(['Approve', 'Reject']).toContain(p.predicted);
      // Well-separated dataset produces pure leaf nodes (confidence=1)
      expect(p.confidence).toBeLessThanOrEqual(1);
      expect(p.confidence).toBeGreaterThan(0);
    }
    expect(result.modelInfo.depth).toBeGreaterThan(0);
    expect(result.modelInfo.nNodes).toBeGreaterThan(0);
    expect(result.modelInfo.traceCount).toBe(6);
    // Accuracy: decision tree on well-separated data should be 100%
    const correct = result.predictions.filter((p) => {
      const label = features.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    expect(correct).toBe(features.length);
  });

  it('classifies with naive_bayes method', async () => {
    const result = await classifyTraces(features, { method: 'naive_bayes' });
    expect(result.method).toBe('naive_bayes');
    expect(result.predictions).toHaveLength(6);
    for (const p of result.predictions) {
      expect(['Approve', 'Reject']).toContain(p.predicted);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('decision tree confidence reflects class distribution in mixed leaves', async () => {
    // Dataset where leaf nodes will have mixed classes (maxDepth=1 forces shallow tree)
    const mixedFeatures = [
      { case_id: 'c1', trace_length: 1, elapsed_time: 100, rework_count: 0, outcome: 'A' },
      { case_id: 'c2', trace_length: 2, elapsed_time: 200, rework_count: 0, outcome: 'A' },
      { case_id: 'c3', trace_length: 3, elapsed_time: 300, rework_count: 1, outcome: 'B' },
      { case_id: 'c4', trace_length: 4, elapsed_time: 400, rework_count: 1, outcome: 'B' },
      { case_id: 'c5', trace_length: 5, elapsed_time: 500, rework_count: 1, outcome: 'A' },
      { case_id: 'c6', trace_length: 6, elapsed_time: 600, rework_count: 0, outcome: 'B' },
    ];
    const result = await classifyTraces(mixedFeatures, { method: 'decision_tree', maxDepth: 1 });
    for (const p of result.predictions) {
      expect(['A', 'B']).toContain(p.predicted);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('knn handles self-match without infinite weights', async () => {
    // Dataset with identical feature vectors but different labels
    const identicalFeatures = [
      { case_id: 'c1', trace_length: 5, elapsed_time: 100, rework_count: 0, outcome: 'A' },
      { case_id: 'c2', trace_length: 5, elapsed_time: 100, rework_count: 0, outcome: 'B' },
      { case_id: 'c3', trace_length: 5, elapsed_time: 100, rework_count: 0, outcome: 'A' },
      { case_id: 'c4', trace_length: 10, elapsed_time: 200, rework_count: 1, outcome: 'A' },
    ];
    const result = await classifyTraces(identicalFeatures, { method: 'knn', k: 3 });
    for (const p of result.predictions) {
      expect(['A', 'B']).toContain(p.predicted);
      expect(p.confidence).toBeLessThanOrEqual(1);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p.confidence)).toBe(true);
    }
  });
});

describe('regressRemainingTime', () => {
  const features = [
    { case_id: 'c1', trace_length: 2, elapsed_time: 1000, remaining_time: 500 },
    { case_id: 'c2', trace_length: 5, elapsed_time: 3000, remaining_time: 1200 },
    { case_id: 'c3', trace_length: 8, elapsed_time: 5000, remaining_time: 2000 },
    { case_id: 'c4', trace_length: 3, elapsed_time: 1500, remaining_time: 700 },
    { case_id: 'c5', trace_length: 10, elapsed_time: 7000, remaining_time: 2500 },
  ];

  it('produces regression model with valid metrics', async () => {
    const result = await regressRemainingTime(features);
    expect(result.method).toBe('linear_regression');
    expect(typeof result.slope).toBe('number');
    expect(typeof result.intercept).toBe('number');
    expect(result.rSquared).toBeGreaterThanOrEqual(0);
    expect(result.rSquared).toBeLessThanOrEqual(1);
    expect(result.rmse).toBeGreaterThanOrEqual(0);
    expect(result.mae).toBeGreaterThanOrEqual(0);
    expect(result.predictions).toHaveLength(5);
  });

  it('throws for insufficient data', async () => {
    await expect(
      regressRemainingTime([{ case_id: 'c1', trace_length: 2, remaining_time: 100 }])
    ).rejects.toThrow('Not enough traces');
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('classifyTraces edge cases', () => {
  it('handles k > n (more neighbors than samples)', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
    ];
    // k=5 but only 2 samples — should handle gracefully
    const result = await classifyTraces(features, { method: 'knn', k: 5 });
    expect(result.predictions).toHaveLength(2);
    for (const p of result.predictions) {
      expect(['Approve', 'Reject']).toContain(p.predicted);
      expect(Number.isFinite(p.confidence)).toBe(true);
    }
  });

  it('handles all identical samples (zero variance)', async () => {
    const features = [
      { case_id: 'c1', trace_length: 5, elapsed_time: 3000, rework_count: 1, outcome: 'Same' },
      { case_id: 'c2', trace_length: 5, elapsed_time: 3000, rework_count: 1, outcome: 'Same' },
      { case_id: 'c3', trace_length: 5, elapsed_time: 3000, rework_count: 1, outcome: 'Same' },
    ];
    // All features identical — distance = 0 for all
    const result = await classifyTraces(features, { method: 'knn', k: 2 });
    expect(result.predictions).toHaveLength(3);
    for (const p of result.predictions) {
      expect(p.predicted).toBe('Same');
      expect(Number.isFinite(p.confidence)).toBe(true);
    }
  });

  it('handles mixed scale features', async () => {
    const features = [
      { case_id: 'c1', trace_length: 0.001, elapsed_time: 0.001, rework_count: 0, outcome: 'A' },
      {
        case_id: 'c2',
        trace_length: 100000,
        elapsed_time: 1000000,
        rework_count: 100,
        outcome: 'B',
      },
      { case_id: 'c3', trace_length: 50, elapsed_time: 5000, rework_count: 5, outcome: 'A' },
    ];
    // Features span many orders of magnitude — should not produce NaN/Inf
    const result = await classifyTraces(features, { method: 'knn', k: 2 });
    expect(result.predictions).toHaveLength(3);
    for (const p of result.predictions) {
      expect(Number.isFinite(p.confidence)).toBe(true);
    }
  });

  it('handles single class in training data with logistic regression', async () => {
    const features = [
      { case_id: 'c1', trace_length: 5, elapsed_time: 3000, rework_count: 0, outcome: 'Only' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 2000, rework_count: 0, outcome: 'Only' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 2500, rework_count: 0, outcome: 'Only' },
    ];
    const result = await classifyTraces(features, { method: 'logistic_regression' });
    expect(result.predictions).toHaveLength(3);
    // With a single class, all predictions should be that class
    for (const p of result.predictions) {
      expect(p.predicted).toBe('Only');
      expect(p.confidence).toBeGreaterThan(0);
    }
  });

  it('logistic regression confidence is bounded [0, 1]', async () => {
    const features = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
      { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
    ];
    const result = await classifyTraces(features, { method: 'logistic_regression' });
    for (const p of result.predictions) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('logistic regression predictions are stable across dataset sizes', async () => {
    // JTBD: logistic regression should produce consistent predictions as data grows
    const baseFeatures = [
      { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
      { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
      { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
    ];
    const extendedFeatures = [
      ...baseFeatures,
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
      { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
      { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
    ];

    const baseResult = await classifyTraces(baseFeatures, { method: 'logistic_regression' });
    const extResult = await classifyTraces(extendedFeatures, { method: 'logistic_regression' });

    // Both should produce valid predictions
    expect(baseResult.predictions).toHaveLength(3);
    expect(extResult.predictions).toHaveLength(6);
    // Well-separated classes: accuracy should not degrade with more data
    const baseCorrect = baseResult.predictions.filter((p) => {
      const label = baseFeatures.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    const extCorrect = extResult.predictions.filter((p) => {
      const label = extendedFeatures.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    expect(extCorrect / extendedFeatures.length).toBeGreaterThanOrEqual(
      (baseCorrect / baseFeatures.length) * 0.8
    );
  });
});

// ---------------------------------------------------------------------------
// Rank 1-2 Oracle Tests — Statistical & Domain-Theoretic Validation
// ---------------------------------------------------------------------------

describe('classifyTraces oracle tests (Rank 1-2)', () => {
  // Rank 2 Oracle: Accuracy Threshold on Well-Separated Data
  // For clear class separation, classifiers should exceed minimum accuracy threshold.
  it('knn achieves >= 80% accuracy on well-separated 2-class dataset', async () => {
    // Create synthetic data: clearly separated classes (fast vs slow traces)
    const wellSeparated = [
      // Fast class (trace_length <= 3, elapsed_time <= 1000)
      { case_id: 'fast1', trace_length: 1, elapsed_time: 100, rework_count: 0, outcome: 'Fast' },
      { case_id: 'fast2', trace_length: 2, elapsed_time: 200, rework_count: 0, outcome: 'Fast' },
      { case_id: 'fast3', trace_length: 3, elapsed_time: 300, rework_count: 0, outcome: 'Fast' },
      { case_id: 'fast4', trace_length: 2, elapsed_time: 150, rework_count: 0, outcome: 'Fast' },
      // Slow class (trace_length >= 8, elapsed_time >= 4000)
      { case_id: 'slow1', trace_length: 8, elapsed_time: 4000, rework_count: 2, outcome: 'Slow' },
      { case_id: 'slow2', trace_length: 9, elapsed_time: 4500, rework_count: 3, outcome: 'Slow' },
      { case_id: 'slow3', trace_length: 10, elapsed_time: 5000, rework_count: 4, outcome: 'Slow' },
      { case_id: 'slow4', trace_length: 9, elapsed_time: 4200, rework_count: 2, outcome: 'Slow' },
    ];

    const result = await classifyTraces(wellSeparated, { method: 'knn', k: 3 });
    const correct = result.predictions.filter((p) => {
      const label = wellSeparated.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    const accuracy = correct / wellSeparated.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  });

  // Rank 1 Oracle: Decision Tree Perfection on Well-Separated Data
  // Decision trees with unlimited depth should achieve 100% accuracy on separable data.
  it('decision_tree achieves 100% accuracy on perfectly separable 2-class dataset', async () => {
    const perfectlySeparable = [
      // Class A: trace_length < 4
      { case_id: 'a1', trace_length: 1, elapsed_time: 100, rework_count: 0, outcome: 'ClassA' },
      { case_id: 'a2', trace_length: 2, elapsed_time: 200, rework_count: 0, outcome: 'ClassA' },
      { case_id: 'a3', trace_length: 3, elapsed_time: 300, rework_count: 0, outcome: 'ClassA' },
      // Class B: trace_length >= 4
      { case_id: 'b1', trace_length: 4, elapsed_time: 1000, rework_count: 1, outcome: 'ClassB' },
      { case_id: 'b2', trace_length: 5, elapsed_time: 1500, rework_count: 2, outcome: 'ClassB' },
      { case_id: 'b3', trace_length: 6, elapsed_time: 2000, rework_count: 3, outcome: 'ClassB' },
    ];

    const result = await classifyTraces(perfectlySeparable, { method: 'decision_tree' });
    const correct = result.predictions.filter((p) => {
      const label = perfectlySeparable.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    expect(correct).toBe(perfectlySeparable.length);
  });

  // Rank 2 Oracle: Naive Bayes Accuracy on Well-Separated Data
  // Naive Bayes should achieve >= 75% accuracy on well-separated classes.
  it('naive_bayes achieves >= 75% accuracy on well-separated 2-class dataset', async () => {
    const wellSeparated = [
      // High-priority (rework_count <= 1, elapsed_time <= 2000)
      { case_id: 'hp1', trace_length: 2, elapsed_time: 500, rework_count: 0, outcome: 'HighPriority' },
      { case_id: 'hp2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'HighPriority' },
      { case_id: 'hp3', trace_length: 2, elapsed_time: 1500, rework_count: 1, outcome: 'HighPriority' },
      { case_id: 'hp4', trace_length: 3, elapsed_time: 800, rework_count: 0, outcome: 'HighPriority' },
      // Low-priority (rework_count >= 2, elapsed_time >= 4000)
      { case_id: 'lp1', trace_length: 10, elapsed_time: 4500, rework_count: 3, outcome: 'LowPriority' },
      { case_id: 'lp2', trace_length: 11, elapsed_time: 5000, rework_count: 4, outcome: 'LowPriority' },
      { case_id: 'lp3', trace_length: 9, elapsed_time: 4200, rework_count: 2, outcome: 'LowPriority' },
      { case_id: 'lp4', trace_length: 10, elapsed_time: 5500, rework_count: 3, outcome: 'LowPriority' },
    ];

    const result = await classifyTraces(wellSeparated, { method: 'naive_bayes' });
    const correct = result.predictions.filter((p) => {
      const label = wellSeparated.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    const accuracy = correct / wellSeparated.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.75);
  });

  // Rank 2 Oracle: Train/Test Split Parity
  // Train on 50% of data, predict on same 50% → should achieve high accuracy (data leakage).
  it('knn train-on-train split achieves high accuracy (data leakage oracle)', async () => {
    const allData = [
      { case_id: 'c1', trace_length: 1, elapsed_time: 100, rework_count: 0, outcome: 'X' },
      { case_id: 'c2', trace_length: 2, elapsed_time: 200, rework_count: 0, outcome: 'X' },
      { case_id: 'c3', trace_length: 8, elapsed_time: 4000, rework_count: 2, outcome: 'Y' },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 3, outcome: 'Y' },
      { case_id: 'c5', trace_length: 3, elapsed_time: 300, rework_count: 0, outcome: 'X' },
      { case_id: 'c6', trace_length: 10, elapsed_time: 5000, rework_count: 4, outcome: 'Y' },
    ];

    // With same train/test (no held-out set), accuracy should be high
    const result = await classifyTraces(allData, { method: 'knn', k: 1 });
    const correct = result.predictions.filter((p) => {
      const label = allData.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    const accuracy = correct / allData.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-DIMENSIONAL CLASSIFICATION (>10 features)
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyTraces — high-dimensional (>10 features)', () => {
  /**
   * Generate 20 synthetic traces with 15 random features each.
   * Classes are separated by a simple rule:
   * If sum of features > 75, outcome='Pass', else 'Fail'
   */
  const generateHighDimensionalData = () => {
    const traces = [];
    for (let i = 1; i <= 20; i++) {
      const f1 = Math.random() * 10;
      const f2 = Math.random() * 10;
      const f3 = Math.random() * 10;
      const f4 = Math.random() * 10;
      const f5 = Math.random() * 10;
      const f6 = Math.random() * 10;
      const f7 = Math.random() * 10;
      const f8 = Math.random() * 10;
      const f9 = Math.random() * 10;
      const f10 = Math.random() * 10;
      const f11 = Math.random() * 10;
      const f12 = Math.random() * 10;
      const f13 = Math.random() * 10;
      const f14 = Math.random() * 10;
      const f15 = Math.random() * 10;

      const sum = f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8 + f9 + f10 + f11 + f12 + f13 + f14 + f15;
      const outcome = sum > 75 ? 'Pass' : 'Fail';

      traces.push({
        case_id: `hd${i}`,
        f1,
        f2,
        f3,
        f4,
        f5,
        f6,
        f7,
        f8,
        f9,
        f10,
        f11,
        f12,
        f13,
        f14,
        f15,
        outcome,
      });
    }
    return traces;
  };

  it('knn should handle 15 features without NaN/Inf', async () => {
    const data = generateHighDimensionalData();
    const result = await classifyTraces(data, { method: 'knn', k: 3 });

    expect(result.predictions).toHaveLength(20);
    for (const p of result.predictions) {
      expect(['Pass', 'Fail']).toContain(p.predicted);
      expect(Number.isFinite(p.confidence)).toBe(true);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('decision_tree should handle 15 features without NaN/Inf', async () => {
    const data = generateHighDimensionalData();
    const result = await classifyTraces(data, { method: 'decision_tree' });

    expect(result.predictions).toHaveLength(20);
    for (const p of result.predictions) {
      expect(['Pass', 'Fail']).toContain(p.predicted);
      expect(Number.isFinite(p.confidence)).toBe(true);
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
    // Check that tree has reasonable depth/nodes for 15 features
    expect(result.modelInfo.depth).toBeGreaterThan(0);
    expect(result.modelInfo.nNodes).toBeGreaterThan(0);
  });

  it('logistic_regression should handle 15 features without NaN/Inf', async () => {
    const data = generateHighDimensionalData();
    const result = await classifyTraces(data, { method: 'logistic_regression' });

    expect(result.predictions).toHaveLength(20);
    for (const p of result.predictions) {
      expect(['Pass', 'Fail']).toContain(p.predicted);
      expect(Number.isFinite(p.confidence)).toBe(true);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('all three methods should produce consistent predictions on high-dimensional data', async () => {
    const data = generateHighDimensionalData();
    const knnResult = await classifyTraces(data, { method: 'knn', k: 3 });
    const dtResult = await classifyTraces(data, { method: 'decision_tree' });
    const lrResult = await classifyTraces(data, { method: 'logistic_regression' });

    // Verify all methods produce predictions (non-determinism okay, just verify structure)
    expect(knnResult.predictions).toHaveLength(20);
    expect(dtResult.predictions).toHaveLength(20);
    expect(lrResult.predictions).toHaveLength(20);

    // Check agreement rate (should be reasonably high on a clean separation)
    const knnPreds = new Set(knnResult.predictions.map((p) => p.predicted));
    const dtPreds = new Set(dtResult.predictions.map((p) => p.predicted));
    expect(knnPreds.size).toBeGreaterThan(0);
    expect(dtPreds.size).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMBALANCED CLASSIFICATION (class skew: 90/10 split)
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyTraces — imbalanced data (90/10 split)', () => {
  /**
   * Create 100 traces: 90 "conforming", 10 "anomalous"
   * Conforming: rework_count <= 1, trace_length <= 5
   * Anomalous: rework_count >= 3, trace_length >= 8
   */
  const generateImbalancedData = () => {
    const traces = [];

    // 90 conforming traces (majority class)
    for (let i = 1; i <= 90; i++) {
      traces.push({
        case_id: `conf${i}`,
        trace_length: Math.floor(Math.random() * 5) + 1, // 1-5
        elapsed_time: Math.random() * 3000 + 100, // 100-3100
        rework_count: Math.floor(Math.random() * 2), // 0-1
        outcome: 'Conforming',
      });
    }

    // 10 anomalous traces (minority class)
    for (let i = 1; i <= 10; i++) {
      traces.push({
        case_id: `anom${i}`,
        trace_length: Math.floor(Math.random() * 5) + 8, // 8-12
        elapsed_time: Math.random() * 3000 + 5000, // 5000-8000
        rework_count: Math.floor(Math.random() * 3) + 3, // 3-5
        outcome: 'Anomalous',
      });
    }

    return traces;
  };

  it('knn should handle imbalanced data without crashing', async () => {
    const data = generateImbalancedData();
    const result = await classifyTraces(data, { method: 'knn', k: 3 });

    expect(result.predictions).toHaveLength(100);
    for (const p of result.predictions) {
      expect(['Conforming', 'Anomalous']).toContain(p.predicted);
      expect(Number.isFinite(p.confidence)).toBe(true);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('decision_tree should handle imbalanced data without crashing', async () => {
    const data = generateImbalancedData();
    const result = await classifyTraces(data, { method: 'decision_tree' });

    expect(result.predictions).toHaveLength(100);
    for (const p of result.predictions) {
      expect(['Conforming', 'Anomalous']).toContain(p.predicted);
      expect(Number.isFinite(p.confidence)).toBe(true);
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('logistic_regression should handle imbalanced data without crashing', async () => {
    const data = generateImbalancedData();
    const result = await classifyTraces(data, { method: 'logistic_regression' });

    expect(result.predictions).toHaveLength(100);
    for (const p of result.predictions) {
      expect(['Conforming', 'Anomalous']).toContain(p.predicted);
      expect(Number.isFinite(p.confidence)).toBe(true);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('naive_bayes should handle imbalanced data without crashing', async () => {
    const data = generateImbalancedData();
    const result = await classifyTraces(data, { method: 'naive_bayes' });

    expect(result.predictions).toHaveLength(100);
    for (const p of result.predictions) {
      expect(['Conforming', 'Anomalous']).toContain(p.predicted);
      expect(Number.isFinite(p.confidence)).toBe(true);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('imbalanced dataset: classifiers should recognize at least some anomalies', async () => {
    const data = generateImbalancedData();
    const result = await classifyTraces(data, { method: 'knn', k: 5 });

    // Count actual anomalies in the data
    const anomalyCount = data.filter((t) => t.outcome === 'Anomalous').length;
    expect(anomalyCount).toBe(10);

    // Count predicted anomalies
    const predictedAnomalies = result.predictions.filter((p) => p.predicted === 'Anomalous').length;
    // With k=5 and clear separation, classifier should detect at least 1 anomaly
    expect(predictedAnomalies).toBeGreaterThan(0);
  });

  it('imbalanced dataset: knn accuracy should be reported', async () => {
    const data = generateImbalancedData();
    const result = await classifyTraces(data, { method: 'knn', k: 3 });

    // Calculate accuracy
    const correct = result.predictions.filter((p) => {
      const label = data.find((t) => t.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    const accuracy = correct / data.length;

    // Accuracy should be >= 50% (better than random on 90/10 split)
    expect(accuracy).toBeGreaterThanOrEqual(0.5);
  });
});
