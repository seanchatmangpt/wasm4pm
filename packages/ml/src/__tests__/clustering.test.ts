import { describe, it, expect } from 'vitest';
import { clusterTraces } from '../clustering.js';

describe('clusterTraces', () => {
  const features = [
    { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
    { case_id: 'c2', trace_length: 3, elapsed_time: 800, rework_count: 0 },
    { case_id: 'c3', trace_length: 2, elapsed_time: 600, rework_count: 0 },
    { case_id: 'c4', trace_length: 10, elapsed_time: 5000, rework_count: 3 },
    { case_id: 'c5', trace_length: 11, elapsed_time: 5500, rework_count: 4 },
    { case_id: 'c6', trace_length: 9, elapsed_time: 4500, rework_count: 2 },
  ];

  it('clusters with kmeans', async () => {
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    expect(result.method).toBe('kmeans');
    expect(result.clusterCount).toBe(2);
    expect(result.noiseCount).toBe(0);
    expect(result.assignments).toHaveLength(6);
    for (const a of result.assignments) {
      expect(typeof a.cluster).toBe('number');
    }
    // The two clear groups should be separated
    const group0 = result.assignments.filter(a => a.cluster === 0).map(a => a.caseId);
    const group1 = result.assignments.filter(a => a.cluster === 1).map(a => a.caseId);
    // At least one group should have the "short" traces (c1, c2, c3)
    const shortTraces = ['c1', 'c2', 'c3'];
    expect(
      shortTraces.every(t => group0.includes(t)) ||
      shortTraces.every(t => group1.includes(t)),
    ).toBe(true);
  });

  it('clusters with dbscan', async () => {
    const result = await clusterTraces(features, { method: 'dbscan', eps: 1000, minPoints: 2 });
    expect(result.method).toBe('dbscan');
    expect(result.assignments).toHaveLength(6);
    expect(result.clusterCount).toBeGreaterThanOrEqual(1);
  });

  it('returns empty assignments for empty input', async () => {
    const result = await clusterTraces([]);
    expect(result.assignments).toEqual([]);
    expect(result.clusterCount).toBe(0);
  });
});
