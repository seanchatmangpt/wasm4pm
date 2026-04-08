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
  });

  it('returns empty predictions for empty input', async () => {
    const result = await classifyTraces([]);
    expect(result.predictions).toEqual([]);
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
