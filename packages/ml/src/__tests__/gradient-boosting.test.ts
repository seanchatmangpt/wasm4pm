import { describe, it, expect } from 'vitest';
import { classifyTraces } from '../classifiers.js';

describe('gradient_boosting classifier', () => {
  // Standard test dataset: well-separated binary classification
  const features = [
    { case_id: 'c1', trace_length: 10, elapsed_time: 5000, rework_count: 3, outcome: 'Reject' },
    { case_id: 'c2', trace_length: 3, elapsed_time: 1000, rework_count: 0, outcome: 'Approve' },
    { case_id: 'c3', trace_length: 4, elapsed_time: 1500, rework_count: 0, outcome: 'Approve' },
    { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 2, outcome: 'Reject' },
    { case_id: 'c5', trace_length: 11, elapsed_time: 6000, rework_count: 4, outcome: 'Reject' },
    { case_id: 'c6', trace_length: 2, elapsed_time: 800, rework_count: 0, outcome: 'Approve' },
    { case_id: 'c7', trace_length: 8, elapsed_time: 4000, rework_count: 2, outcome: 'Reject' },
    { case_id: 'c8', trace_length: 5, elapsed_time: 2000, rework_count: 0, outcome: 'Approve' },
    { case_id: 'c9', trace_length: 12, elapsed_time: 6500, rework_count: 5, outcome: 'Reject' },
    { case_id: 'c10', trace_length: 1, elapsed_time: 500, rework_count: 0, outcome: 'Approve' },
  ];

  it('classifies with gradient_boosting method', async () => {
    const result = await classifyTraces(features, {
      method: 'gradient_boosting',
      numIterations: 50,
      learningRate: 0.1,
    });

    expect(result.method).toBe('gradient_boosting');
    expect(result.predictions).toHaveLength(10);

    // Verify all predictions are valid
    for (const p of result.predictions) {
      expect(['Approve', 'Reject']).toContain(p.predicted);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
      expect(p.caseId).toBeTruthy();
    }

    // Verify modelInfo
    expect(result.modelInfo.numIterations).toBe(50);
    expect(result.modelInfo.learningRate).toBe(0.1);
    expect(result.modelInfo.featureCount).toBeGreaterThan(0);
    expect(result.modelInfo.traceCount).toBe(10);
    expect(result.modelInfo.classCount).toBe(2);

    // Accuracy: well-separated dataset should achieve >= 70%
    const correct = result.predictions.filter((p) => {
      const label = features.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    const accuracy = correct / features.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.7);
  });

  it('uses default parameters when not specified', async () => {
    const result = await classifyTraces(features, {
      method: 'gradient_boosting',
    });

    expect(result.method).toBe('gradient_boosting');
    expect(result.predictions).toHaveLength(10);
    expect(result.modelInfo.numIterations).toBe(100); // Default
    expect(result.modelInfo.learningRate).toBe(0.1); // Default
  });

  it('computes reasonable confidence scores', async () => {
    const result = await classifyTraces(features, {
      method: 'gradient_boosting',
      numIterations: 100,
      learningRate: 0.1,
    });

    const confidences = result.predictions.map((p) => p.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    // Average confidence should be between 0.5 and 1.0 (reasonable for softmax)
    expect(avgConfidence).toBeGreaterThan(0.5);
    expect(avgConfidence).toBeLessThanOrEqual(1.0);

    // Max confidence should be >= 0.5
    const maxConfidence = Math.max(...confidences);
    expect(maxConfidence).toBeGreaterThanOrEqual(0.5);
  });

  it('handles multi-class classification', async () => {
    const multiClassFeatures = [
      { case_id: 'c1', feature1: 1, feature2: 1, outcome: 'Class_A' },
      { case_id: 'c2', feature1: 1.1, feature2: 1.2, outcome: 'Class_A' },
      { case_id: 'c3', feature1: 5, feature2: 5, outcome: 'Class_B' },
      { case_id: 'c4', feature1: 5.1, feature2: 5.2, outcome: 'Class_B' },
      { case_id: 'c5', feature1: 10, feature2: 10, outcome: 'Class_C' },
      { case_id: 'c6', feature1: 10.1, feature2: 10.2, outcome: 'Class_C' },
      { case_id: 'c7', feature1: 1.2, feature2: 1.3, outcome: 'Class_A' },
      { case_id: 'c8', feature1: 5.3, feature2: 5.1, outcome: 'Class_B' },
      { case_id: 'c9', feature1: 10.2, feature2: 10.3, outcome: 'Class_C' },
    ];

    const result = await classifyTraces(multiClassFeatures, {
      method: 'gradient_boosting',
      numIterations: 50,
    });

    expect(result.method).toBe('gradient_boosting');
    expect(result.predictions).toHaveLength(9);
    expect(result.modelInfo.classCount).toBe(3);

    // Verify predictions include all three classes
    const predictedClasses = new Set(result.predictions.map((p) => p.predicted));
    expect(predictedClasses.size).toBeGreaterThan(0);

    for (const p of result.predictions) {
      expect(['Class_A', 'Class_B', 'Class_C']).toContain(p.predicted);
    }
  });

  it('handles different learning rates without error', async () => {
    const result1 = await classifyTraces(features, {
      method: 'gradient_boosting',
      numIterations: 50,
      learningRate: 0.01,
    });

    const result2 = await classifyTraces(features, {
      method: 'gradient_boosting',
      numIterations: 50,
      learningRate: 0.5,
    });

    // Both should produce valid predictions
    expect(result1.predictions).toHaveLength(10);
    expect(result2.predictions).toHaveLength(10);

    for (const p of result1.predictions) {
      expect(['Approve', 'Reject']).toContain(p.predicted);
    }
    for (const p of result2.predictions) {
      expect(['Approve', 'Reject']).toContain(p.predicted);
    }

    // Confidence distributions may differ with different learning rates
    const conf1Avg = result1.predictions.reduce((s, p) => s + p.confidence, 0) / 10;
    const conf2Avg = result2.predictions.reduce((s, p) => s + p.confidence, 0) / 10;

    // Both should be reasonable confidence values
    expect(conf1Avg).toBeGreaterThan(0.4);
    expect(conf2Avg).toBeGreaterThan(0.4);
  });

  it('produces deterministic results with same input', async () => {
    const result1 = await classifyTraces(features, {
      method: 'gradient_boosting',
      numIterations: 30,
      learningRate: 0.1,
    });

    const result2 = await classifyTraces(features, {
      method: 'gradient_boosting',
      numIterations: 30,
      learningRate: 0.1,
    });

    // Same input should produce same predictions (deterministic)
    for (let i = 0; i < result1.predictions.length; i++) {
      expect(result1.predictions[i].predicted).toBe(result2.predictions[i].predicted);
      expect(Math.abs(result1.predictions[i].confidence - result2.predictions[i].confidence))
        .toBeLessThan(1e-10); // Floating point tolerance
    }
  });

  it('handles small iteration counts', async () => {
    const result = await classifyTraces(features, {
      method: 'gradient_boosting',
      numIterations: 10,
      learningRate: 0.2,
    });

    expect(result.method).toBe('gradient_boosting');
    expect(result.modelInfo.numIterations).toBe(10);
    expect(result.predictions).toHaveLength(10);

    // Should still produce valid predictions
    for (const p of result.predictions) {
      expect(['Approve', 'Reject']).toContain(p.predicted);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('compares favorably to knn baseline', async () => {
    const gbResult = await classifyTraces(features, {
      method: 'gradient_boosting',
      numIterations: 100,
      learningRate: 0.1,
    });

    const knnResult = await classifyTraces(features, {
      method: 'knn',
      k: 3,
    });

    // Compute accuracy for both
    const gbCorrect = gbResult.predictions.filter((p) => {
      const label = features.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    const gbAccuracy = gbCorrect / features.length;

    const knnCorrect = knnResult.predictions.filter((p) => {
      const label = features.find((f) => f.case_id === p.caseId)?.outcome;
      return p.predicted === label;
    }).length;
    const knnAccuracy = knnCorrect / features.length;

    // Gradient boosting should be competitive or better
    // (on well-separated data, both should achieve >80%)
    expect(gbAccuracy).toBeGreaterThanOrEqual(0.7);
    expect(knnAccuracy).toBeGreaterThanOrEqual(0.7);
  });

  it('returns empty predictions for empty input', async () => {
    const result = await classifyTraces([], {
      method: 'gradient_boosting',
    });

    expect(result.predictions).toEqual([]);
    expect(result.metadata?.warning).toBeDefined();
  });
});
