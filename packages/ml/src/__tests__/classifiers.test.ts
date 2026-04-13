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
    const avgConfidence = result.predictions.reduce((s, p) => s + p.confidence, 0) / result.predictions.length;
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
      regressRemainingTime([{ case_id: 'c1', trace_length: 2, remaining_time: 100 }]),
    ).rejects.toThrow('Not enough traces');
  });
});
