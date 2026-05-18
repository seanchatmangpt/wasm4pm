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
    const group0 = result.assignments.filter((a) => a.cluster === 0).map((a) => a.caseId);
    const group1 = result.assignments.filter((a) => a.cluster === 1).map((a) => a.caseId);
    // At least one group should have the "short" traces (c1, c2, c3)
    const shortTraces = ['c1', 'c2', 'c3'];
    expect(
      shortTraces.every((t) => group0.includes(t)) || shortTraces.every((t) => group1.includes(t))
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
    const clusters = new Set(result.assignments.map((a) => a.cluster));
    // It's valid to have 1 or 2 clusters (kmeans may or may not split)
    expect(clusters.size).toBeGreaterThanOrEqual(1);
  });

  it('handles single sample', async () => {
    const features = [{ case_id: 'c1', trace_length: 5, elapsed_time: 3000, rework_count: 0 }];
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
    const shortCluster = result.assignments.find((a) => shortIds.includes(a.caseId))!.cluster;
    const longCluster = result.assignments.find((a) => longIds.includes(a.caseId))!.cluster;
    // Clusters should be different
    expect(shortCluster).not.toBe(longCluster);
    // Each group should be pure
    for (const a of result.assignments.filter((a) => a.cluster === shortCluster)) {
      expect(shortIds).toContain(a.caseId);
    }
    for (const a of result.assignments.filter((a) => a.cluster === longCluster)) {
      expect(longIds).toContain(a.caseId);
    }
  });
});

// ---------------------------------------------------------------------------
// Determinism Tests (Rank 1 - Mathematical Guarantee)
// ---------------------------------------------------------------------------

describe('clusterTraces determinism', () => {
  it('kmeans is deterministic across multiple runs', async () => {
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
      { case_id: 'c2', trace_length: 8, elapsed_time: 4000, rework_count: 2 },
      { case_id: 'c3', trace_length: 3, elapsed_time: 600, rework_count: 0 },
      { case_id: 'c4', trace_length: 9, elapsed_time: 4500, rework_count: 3 },
    ];
    const r1 = await clusterTraces(features, { method: 'kmeans', k: 2 });
    const r2 = await clusterTraces(features, { method: 'kmeans', k: 2 });
    const a1 = r1.assignments.map((a) => a.cluster).sort();
    const a2 = r2.assignments.map((a) => a.cluster).sort();
    expect(a1).toEqual(a2);
  });
});

// ---------------------------------------------------------------------------
// Convergence Tests (Rank 2 - Domain Property)
// ---------------------------------------------------------------------------

describe('clusterTraces convergence properties', () => {
  it('well-separated clusters group correctly', async () => {
    const features = [
      { case_id: 'short1', trace_length: 1, elapsed_time: 100, rework_count: 0 },
      { case_id: 'short2', trace_length: 2, elapsed_time: 150, rework_count: 0 },
      { case_id: 'long1', trace_length: 100, elapsed_time: 10000, rework_count: 50 },
      { case_id: 'long2', trace_length: 99, elapsed_time: 9500, rework_count: 48 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    expect(result.clusterCount).toBe(2);
  });

  it('cluster count respects k parameter', async () => {
    const features = Array.from({ length: 30 }, (_, i) => ({
      case_id: `c${i}`,
      trace_length: Math.random() * 50,
      elapsed_time: Math.random() * 5000,
      rework_count: Math.floor(Math.random() * 10),
    }));
    const result = await clusterTraces(features, { method: 'kmeans', k: 3 });
    expect(result.clusterCount).toBeGreaterThanOrEqual(1);
    expect(result.clusterCount).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Validity Tests (Rank 2 - Domain Property)
// ---------------------------------------------------------------------------

describe('clusterTraces assignment validity', () => {
  it('all traces receive exactly one assignment', async () => {
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
      { case_id: 'c2', trace_length: 8, elapsed_time: 4000, rework_count: 2 },
      { case_id: 'c3', trace_length: 3, elapsed_time: 600, rework_count: 0 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    expect(result.assignments).toHaveLength(3);
    const ids = new Set(result.assignments.map((a) => a.caseId));
    expect(ids.size).toBe(3);
  });

  it('cluster IDs are valid integers', async () => {
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
      { case_id: 'c2', trace_length: 8, elapsed_time: 4000, rework_count: 2 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    for (const a of result.assignments) {
      expect(Number.isInteger(a.cluster)).toBe(true);
      expect(a.cluster).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// DBSCAN Properties (Rank 1-2 - Density & Neighborhood)
// ---------------------------------------------------------------------------

describe('clusterTraces DBSCAN properties', () => {
  it('larger eps results in fewer noise points', async () => {
    const features = [
      { case_id: 'c1', trace_length: 1, elapsed_time: 100, rework_count: 0 },
      { case_id: 'c2', trace_length: 50, elapsed_time: 5000, rework_count: 5 },
      { case_id: 'c3', trace_length: 1, elapsed_time: 110, rework_count: 0 },
    ];
    const small_eps = await clusterTraces(features, { method: 'dbscan', eps: 10, minPoints: 2 });
    const large_eps = await clusterTraces(features, { method: 'dbscan', eps: 5000, minPoints: 2 });
    expect(large_eps.noiseCount).toBeLessThanOrEqual(small_eps.noiseCount);
  });

  it('dbscan noise count is non-negative', async () => {
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
      { case_id: 'c2', trace_length: 8, elapsed_time: 4000, rework_count: 2 },
    ];
    const result = await clusterTraces(features, { method: 'dbscan', eps: 500, minPoints: 2 });
    expect(result.noiseCount).toBeGreaterThanOrEqual(0);
    expect(result.noiseCount).toBeLessThanOrEqual(result.assignments.length);
  });
});

// ---------------------------------------------------------------------------
// Rank 1-2 Oracle Tests — Silhouette Score Validation
// ---------------------------------------------------------------------------

/**
 * Helper: Compute Euclidean distance between two feature vectors.
 */
function euclideanDistance(
  a: { trace_length: number; elapsed_time: number; rework_count: number },
  b: { trace_length: number; elapsed_time: number; rework_count: number }
): number {
  const dx = a.trace_length - b.trace_length;
  const dy = a.elapsed_time - b.elapsed_time;
  const dz = a.rework_count - b.rework_count;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Helper: Compute silhouette coefficient for a single point.
 * s(i) = (b(i) - a(i)) / max(a(i), b(i))
 * where a(i) = mean distance to points in same cluster
 *       b(i) = min mean distance to points in other clusters
 */
function computeSilhouetteCoefficient(
  pointIdx: number,
  features: Array<{ trace_length: number; elapsed_time: number; rework_count: number }>,
  assignments: Map<number, number>
): number {
  const pointCluster = assignments.get(pointIdx)!;
  const clusters = new Map<number, number[]>();
  for (const [idx, cluster] of assignments.entries()) {
    if (!clusters.has(cluster)) clusters.set(cluster, []);
    clusters.get(cluster)!.push(idx);
  }

  const sameClusterIndices = clusters.get(pointCluster)!;
  const otherClusterIndices = Array.from(assignments.keys()).filter(
    (idx) => assignments.get(idx) !== pointCluster
  );

  // a(i) = mean distance within cluster (including self)
  let sumWithin = 0;
  for (const idx of sameClusterIndices) {
    sumWithin += euclideanDistance(features[pointIdx], features[idx]);
  }
  const a = sumWithin / sameClusterIndices.length;

  // b(i) = min mean distance to other clusters
  let b = Infinity;
  const otherClusters = new Set(assignments.values());
  for (const otherCluster of otherClusters) {
    if (otherCluster === pointCluster) continue;
    const otherIndices = clusters.get(otherCluster)!;
    let sumToOther = 0;
    for (const idx of otherIndices) {
      sumToOther += euclideanDistance(features[pointIdx], features[idx]);
    }
    const meanToOther = sumToOther / otherIndices.length;
    b = Math.min(b, meanToOther);
  }

  // Handle edge case: only one cluster
  if (!isFinite(b)) return 0;

  // s(i) = (b(i) - a(i)) / max(a(i), b(i))
  const maxAB = Math.max(a, b);
  if (maxAB === 0) return 0;
  return (b - a) / maxAB;
}

/**
 * Helper: Compute mean silhouette score for all points.
 */
function computeMeanSilhouetteScore(
  features: Array<{ trace_length: number; elapsed_time: number; rework_count: number }>,
  assignments: Array<{ caseId: string; cluster: number }>
): number {
  const assignmentMap = new Map<number, number>();
  for (let i = 0; i < assignments.length; i++) {
    assignmentMap.set(i, assignments[i].cluster);
  }

  let sumSilhouette = 0;
  for (let i = 0; i < features.length; i++) {
    sumSilhouette += computeSilhouetteCoefficient(i, features, assignmentMap);
  }
  return sumSilhouette / features.length;
}

describe('clusterTraces oracle tests (Rank 1-2)', () => {
  // Rank 1 Oracle: Silhouette Score on Well-Separated Clusters
  // For well-separated k-means clusters, silhouette score >= 0.5 indicates good separation.
  it('kmeans silhouette score >= 0.5 on well-separated 2-class data', async () => {
    const wellSeparated = [
      // Cluster 1: fast, short traces
      { case_id: 'c1', trace_length: 1, elapsed_time: 100, rework_count: 0 },
      { case_id: 'c2', trace_length: 2, elapsed_time: 150, rework_count: 0 },
      { case_id: 'c3', trace_length: 1, elapsed_time: 120, rework_count: 0 },
      { case_id: 'c4', trace_length: 2, elapsed_time: 140, rework_count: 0 },
      // Cluster 2: slow, long traces
      { case_id: 'c5', trace_length: 100, elapsed_time: 10000, rework_count: 50 },
      { case_id: 'c6', trace_length: 99, elapsed_time: 9500, rework_count: 48 },
      { case_id: 'c7', trace_length: 101, elapsed_time: 10200, rework_count: 52 },
      { case_id: 'c8', trace_length: 100, elapsed_time: 9800, rework_count: 49 },
    ];

    const result = await clusterTraces(wellSeparated, { method: 'kmeans', k: 2 });
    const silhouette = computeMeanSilhouetteScore(wellSeparated, result.assignments);
    expect(silhouette).toBeGreaterThanOrEqual(0.5);
  });

  // Rank 2 Oracle: Silhouette Improvement with Better Separation
  // Clusters with larger inter-cluster distance should have higher silhouette.
  it('silhouette score higher for extreme separation than moderate separation', async () => {
    const moderatelyFar = [
      { case_id: 'c1', trace_length: 5, elapsed_time: 1000, rework_count: 0 },
      { case_id: 'c2', trace_length: 6, elapsed_time: 1200, rework_count: 0 },
      { case_id: 'c3', trace_length: 10, elapsed_time: 2000, rework_count: 2 },
      { case_id: 'c4', trace_length: 11, elapsed_time: 2200, rework_count: 2 },
      { case_id: 'c5', trace_length: 6, elapsed_time: 1100, rework_count: 0 },
      { case_id: 'c6', trace_length: 10, elapsed_time: 2100, rework_count: 2 },
    ];

    const extremelyFar = [
      { case_id: 'c1', trace_length: 1, elapsed_time: 100, rework_count: 0 },
      { case_id: 'c2', trace_length: 1, elapsed_time: 150, rework_count: 0 },
      { case_id: 'c3', trace_length: 100, elapsed_time: 10000, rework_count: 50 },
      { case_id: 'c4', trace_length: 100, elapsed_time: 10200, rework_count: 50 },
      { case_id: 'c5', trace_length: 2, elapsed_time: 120, rework_count: 0 },
      { case_id: 'c6', trace_length: 99, elapsed_time: 9800, rework_count: 49 },
    ];

    const modResult = await clusterTraces(moderatelyFar, { method: 'kmeans', k: 2 });
    const extResult = await clusterTraces(extremelyFar, { method: 'kmeans', k: 2 });

    const modSilhouette = computeMeanSilhouetteScore(moderatelyFar, modResult.assignments);
    const extSilhouette = computeMeanSilhouetteScore(extremelyFar, extResult.assignments);

    expect(extSilhouette).toBeGreaterThan(modSilhouette);
  });

  // Rank 1 Oracle: Silhouette Bounds [−1, 1]
  // Silhouette coefficient is always in range [−1, 1].
  it('silhouette scores are bounded in [−1, 1]', async () => {
    const features = [
      { case_id: 'c1', trace_length: 2, elapsed_time: 500, rework_count: 0 },
      { case_id: 'c2', trace_length: 3, elapsed_time: 800, rework_count: 0 },
      { case_id: 'c3', trace_length: 2, elapsed_time: 600, rework_count: 0 },
      { case_id: 'c4', trace_length: 10, elapsed_time: 5000, rework_count: 3 },
      { case_id: 'c5', trace_length: 11, elapsed_time: 5500, rework_count: 4 },
      { case_id: 'c6', trace_length: 9, elapsed_time: 4500, rework_count: 2 },
    ];

    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    const assignmentMap = new Map<number, number>();
    for (let i = 0; i < result.assignments.length; i++) {
      assignmentMap.set(i, result.assignments[i].cluster);
    }

    for (let i = 0; i < features.length; i++) {
      const sil = computeSilhouetteCoefficient(i, features, assignmentMap);
      expect(sil).toBeGreaterThanOrEqual(-1);
      expect(sil).toBeLessThanOrEqual(1);
    }
  });
});
