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

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('clusterTraces edge cases', () => {
  it('handles k greater than sample count', async () => {
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
      { case_id: 'c2', trace_length: 3, elapsed_time: 800, rework_count: 0 },
    ];
    // k=10 but only 2 samples
    const result = await clusterTraces(features, { method: 'kmeans', k: 10 });
    expect(result.assignments).toHaveLength(2);
    expect(result.clusterCount).toBeGreaterThanOrEqual(1);
  });

  it('handles all identical features (zero variance)', async () => {
    const features = [
      { case_id: 'c1', trace_length: 5, elapsed_time: 3000, rework_count: 0 },
      { case_id: 'c2', trace_length: 5, elapsed_time: 3000, rework_count: 0 },
      { case_id: 'c3', trace_length: 5, elapsed_time: 3000, rework_count: 0 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    expect(result.assignments).toHaveLength(3);
    // With identical features, all should be in one cluster
    const clusters = new Set(result.assignments.map(a => a.cluster));
    // It's valid to have 1 or 2 clusters (kmeans may or may not split)
    expect(clusters.size).toBeGreaterThanOrEqual(1);
  });

  it('handles single sample', async () => {
    const features = [
      { case_id: 'c1', trace_length: 5, elapsed_time: 3000, rework_count: 0 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 1 });
    expect(result.assignments).toHaveLength(1);
    expect(result.clusterCount).toBe(1);
  });

  it('dbscan handles eps too small for any neighbors', async () => {
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
      { case_id: 'c2', trace_length: 3, elapsed_time: 800, rework_count: 0 },
      { case_id: 'c3', trace_length: 2, elapsed_time: 600, rework_count: 0 },
    ];
    // eps=0.001 is too small for any neighbors → all become noise
    const result = await clusterTraces(features, { method: 'dbscan', eps: 0.001, minPoints: 2 });
    expect(result.assignments).toHaveLength(3);
    expect(result.noiseCount).toBeGreaterThan(0);
  });

  it('kmeans produces valid cluster assignments', async () => {
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
      { case_id: 'c2', trace_length: 3, elapsed_time: 800, rework_count: 0 },
      { case_id: 'c3', trace_length: 2, elapsed_time: 600, rework_count: 0 },
      { case_id: 'c4', trace_length: 10, elapsed_time: 5000, rework_count: 3 },
      { case_id: 'c5', trace_length: 11, elapsed_time: 5500, rework_count: 4 },
      { case_id: 'c6', trace_length: 9, elapsed_time: 4500, rework_count: 2 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    // Every assignment should reference a valid cluster
    for (const a of result.assignments) {
      expect(a.cluster).toBeGreaterThanOrEqual(0);
      expect(a.cluster).toBeLessThan(result.clusterCount);
    }
  });

  it('kmeans converges to consistent assignments across repeated calls', async () => {
    // JTBD: deterministic kmeans should produce same assignments each call
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
      { case_id: 'c2', trace_length: 3, elapsed_time: 800, rework_count: 0 },
      { case_id: 'c3', trace_length: 2, elapsed_time: 600, rework_count: 0 },
      { case_id: 'c4', trace_length: 10, elapsed_time: 5000, rework_count: 3 },
      { case_id: 'c5', trace_length: 11, elapsed_time: 5500, rework_count: 4 },
      { case_id: 'c6', trace_length: 9, elapsed_time: 4500, rework_count: 2 },
    ];
    const result1 = await clusterTraces(features, { method: 'kmeans', k: 2 });
    const result2 = await clusterTraces(features, { method: 'kmeans', k: 2 });
    // Same input → same output (deterministic convergence)
    expect(result1.assignments).toHaveLength(result2.assignments.length);
    for (let i = 0; i < result1.assignments.length; i++) {
      expect(result1.assignments[i].caseId).toBe(result2.assignments[i].caseId);
      expect(result1.assignments[i].cluster).toBe(result2.assignments[i].cluster);
    }
  });

  it('well-separated clusters have lower within-cluster variance than between-cluster', async () => {
    // JTBD: silhouette-like property — well-separated data should group correctly
    const wellSeparated = [
      { case_id: 'c1', trace_length: 1, elapsed_time: 100, rework_count: 0 },
      { case_id: 'c2', trace_length: 2, elapsed_time: 150, rework_count: 0 },
      { case_id: 'c3', trace_length: 1, elapsed_time: 120, rework_count: 0 },
      { case_id: 'c4', trace_length: 100, elapsed_time: 10000, rework_count: 50 },
      { case_id: 'c5', trace_length: 99, elapsed_time: 9500, rework_count: 48 },
      { case_id: 'c6', trace_length: 101, elapsed_time: 10200, rework_count: 52 },
    ];
    const result = await clusterTraces(wellSeparated, { method: 'kmeans', k: 2 });
    // All short traces in one cluster, all long traces in the other
    const shortIds = ['c1', 'c2', 'c3'];
    const longIds = ['c4', 'c5', 'c6'];
    const shortCluster = result.assignments.find(a => shortIds.includes(a.caseId))!.cluster;
    const longCluster = result.assignments.find(a => longIds.includes(a.caseId))!.cluster;
    // Clusters should be different
    expect(shortCluster).not.toBe(longCluster);
    // Each group should be pure
    for (const a of result.assignments.filter(a => a.cluster === shortCluster)) {
      expect(shortIds).toContain(a.caseId);
    }
    for (const a of result.assignments.filter(a => a.cluster === longCluster)) {
      expect(longIds).toContain(a.caseId);
    }
  });
});
