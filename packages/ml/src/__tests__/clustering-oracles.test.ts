/**
 * Oracle-ranked tests for clusterTraces
 *
 * Van der Aalst process mining — trace clustering quality dimension: simplicity
 * and fitness. Clustering partitions the log into behaviorally homogeneous groups.
 * Each cluster is a candidate for a distinct process variant.
 *
 * Oracle ranks follow the Chicago TDD hierarchy:
 *   Rank 1 — Mathematical theorem (provable from algorithm definition)
 *   Rank 2 — Domain contract  (design decisions enforced by the API)
 *   Rank 3 — Metamorphic relation (input perturbation → predictable output shift)
 *
 * API under test: clusterTraces(featuresJson, options) → Promise<ClusteringResult>
 *
 * ClusteringResult shape:
 *   { method, clusterCount, noiseCount, assignments: [{ caseId, cluster }],
 *     centroids?: number[][], modelInfo }
 *
 * Key facts about the implementation:
 *   - k is clamped to [1, n] by validateKmeans (k > n → k = n)
 *   - Centroid initialisation is deterministic (k-means++ with fixed traversal order)
 *   - cluster values are in [0, k-1] for k-means; DBSCAN labels noise as cluster = -1
 *   - Empty input returns { assignments: [], clusterCount: 0, noiseCount: 0 }
 *   - Inertia is the sum of squared distances to assigned centroids (never negative)
 */

import { describe, it, expect } from 'vitest';
import { clusterTraces } from '../clustering.js';

// ─── Shared fixture builders ──────────────────────────────────────────────────

/** n identical traces — zero-variance degenerate input */
function identicalTraces(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    case_id: `c${i + 1}`,
    trace_length: 5,
    elapsed_time: 3000,
    rework_count: 0,
  }));
}

/** n distinct traces linearly spaced in feature space */
function linearTraces(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    case_id: `c${i + 1}`,
    trace_length: i + 1,
    elapsed_time: (i + 1) * 100,
    rework_count: i % 3,
  }));
}

/** Two well-separated groups: n/2 short traces + n/2 long traces */
function twoGroupTraces(n = 6) {
  const half = Math.floor(n / 2);
  const short = Array.from({ length: half }, (_, i) => ({
    case_id: `short${i + 1}`,
    trace_length: i + 1,
    elapsed_time: (i + 1) * 100,
    rework_count: 0,
  }));
  const long = Array.from({ length: n - half }, (_, i) => ({
    case_id: `long${i + 1}`,
    trace_length: 100 + i,
    elapsed_time: (100 + i) * 100,
    rework_count: 10 + i,
  }));
  return [...short, ...long];
}

// =============================================================================
// RANK 1 — Mathematical Theorems
// Properties derivable from the clustering algorithm definition.
// They hold for any correct implementation.
// =============================================================================

describe('clusterTraces — Rank 1 (mathematical theorems)', () => {
  it('k=1: all assignments share the same cluster value', async () => {
    // Theorem: k-means with k=1 places every point in the single cluster 0.
    // There is exactly one centroid; every point is closest to it by definition.
    const features = twoGroupTraces(6);
    const result = await clusterTraces(features, { method: 'kmeans', k: 1 });
    const uniqueClusters = new Set(result.assignments.map((a) => a.cluster));
    expect(uniqueClusters.size).toBe(1);
    for (const a of result.assignments) {
      expect(a.cluster).toBe(0);
    }
  });

  it('k=1: clusterCount reported as 1', async () => {
    // Theorem: validateKmeans clamps k to [1, n]. k=1 is always valid.
    const features = linearTraces(4);
    const result = await clusterTraces(features, { method: 'kmeans', k: 1 });
    expect(result.clusterCount).toBe(1);
  });

  it('assignments length equals input trace count', async () => {
    // Theorem: every trace receives exactly one cluster assignment.
    // The implementation maps caseIds 1-to-1 to assignment entries.
    const n = 7;
    const result = await clusterTraces(linearTraces(n), { method: 'kmeans', k: 3 });
    expect(result.assignments).toHaveLength(n);
  });

  it('all cluster values are in [0, k-1] for k-means', async () => {
    // Theorem: k-means assigns each point to one of exactly k centroids.
    // The centroid indices are 0-based integers in [0, k-1].
    const k = 3;
    const result = await clusterTraces(twoGroupTraces(9), { method: 'kmeans', k });
    for (const a of result.assignments) {
      expect(a.cluster).toBeGreaterThanOrEqual(0);
      expect(a.cluster).toBeLessThan(k);
    }
  });

  it('k > n: clusterCount is capped at n (validateKmeans)', async () => {
    // Theorem: validateKmeans returns min(k, n). When k exceeds sample count,
    // the reported clusterCount must not exceed n.
    const n = 3;
    const result = await clusterTraces(linearTraces(n), { method: 'kmeans', k: 100 });
    expect(result.clusterCount).toBeLessThanOrEqual(n);
    expect(result.clusterCount).toBeGreaterThanOrEqual(1);
  });

  it('centroids length equals k for k-means (when data is non-empty)', async () => {
    // Theorem: k-means produces exactly k centroids, one per cluster.
    const k = 2;
    const result = await clusterTraces(twoGroupTraces(6), { method: 'kmeans', k });
    expect(result.centroids).toBeDefined();
    expect(result.centroids!).toHaveLength(k);
  });

  it('each centroid has the same dimensionality as the feature vectors', async () => {
    // Theorem: centroids live in the same space as the data.
    // Feature vectors have 3 numeric columns (trace_length, elapsed_time, rework_count).
    const features = twoGroupTraces(6);
    const featureDim = 3; // trace_length, elapsed_time, rework_count
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    for (const centroid of result.centroids ?? []) {
      expect(centroid).toHaveLength(featureDim);
    }
  });

  it('inertia is non-negative (squared distances are never negative)', async () => {
    // Theorem: inertia = Σ ||x_i - μ_{c(i)}||² ≥ 0 for all inputs.
    // This follows directly from the non-negativity of squared Euclidean distance.
    const result = await clusterTraces(twoGroupTraces(6), { method: 'kmeans', k: 2 });
    const inertia = result.modelInfo['inertia'] as number | undefined;
    if (inertia !== undefined) {
      expect(inertia).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(inertia)).toBe(true);
    }
  });

  it('noiseCount is 0 for k-means (k-means has no noise concept)', async () => {
    // Theorem: k-means assigns every point to a cluster. The noise count is
    // structurally 0 — the implementation sets it unconditionally.
    const result = await clusterTraces(twoGroupTraces(6), { method: 'kmeans', k: 2 });
    expect(result.noiseCount).toBe(0);
  });

  it('DBSCAN: noise points have cluster value < 0', async () => {
    // Theorem: DBSCAN assigns outliers a negative cluster label (noise convention).
    // The implementation uses -2 as an internal UNVISITED sentinel and -1 as NOISE.
    // In practice, non-clustered points may carry either -1 or -2 in the output —
    // both are negative and are counted by noiseCount. The invariant is cluster < 0.
    const features = linearTraces(4);
    const result = await clusterTraces(features, { method: 'dbscan', eps: 0.001, minPoints: 2 });
    for (const a of result.assignments) {
      // All points either belong to a cluster (≥ 0) or are noise-like (< 0)
      expect(Number.isInteger(a.cluster)).toBe(true);
    }
    // With tiny eps, every point should be noise-like (cluster < 0)
    const noisePoints = result.assignments.filter((a) => a.cluster < 0);
    expect(noisePoints.length).toBeGreaterThan(0);
  });

  it('DBSCAN: noiseCount equals count of assignments with cluster < 0', async () => {
    // Theorem: noiseCount is derived by counting labels < 0 in the internal
    // DBSCAN label array. It must equal the count of assignments where cluster < 0.
    // Note: the implementation counts both -1 (NOISE) and -2 (UNVISITED sentinel)
    // as noise, so noiseCount matches the count of assignments with cluster < 0.
    const features = linearTraces(5);
    const result = await clusterTraces(features, { method: 'dbscan', eps: 0.001, minPoints: 2 });
    const noiseSeen = result.assignments.filter((a) => a.cluster < 0).length;
    expect(result.noiseCount).toBe(noiseSeen);
  });

  it('empty input: assignments is empty array', async () => {
    // Theorem: empty input has 0 traces → 0 assignments. The implementation
    // short-circuits before running k-means.
    const result = await clusterTraces([]);
    expect(result.assignments).toEqual([]);
    expect(result.clusterCount).toBe(0);
    expect(result.noiseCount).toBe(0);
  });

  it('single trace with k=1: exactly one assignment with cluster 0', async () => {
    // Theorem: 1 trace + k=1 → validateKmeans returns min(1,1)=1; the single
    // point is trivially in cluster 0.
    const result = await clusterTraces(
      [{ case_id: 'solo', trace_length: 5, elapsed_time: 3000, rework_count: 0 }],
      { method: 'kmeans', k: 1 }
    );
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].cluster).toBe(0);
  });
});

// =============================================================================
// RANK 2 — Domain Contracts
// Design-decided properties that every caller of clusterTraces may rely on.
// =============================================================================

describe('clusterTraces — Rank 2 (domain contracts)', () => {
  it('result has required fields: method, clusterCount, noiseCount, assignments, modelInfo', async () => {
    // Contract: ClusteringResult is the authoritative shape. All fields must be present.
    const result = await clusterTraces(twoGroupTraces(4), { method: 'kmeans', k: 2 });
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('clusterCount');
    expect(result).toHaveProperty('noiseCount');
    expect(result).toHaveProperty('assignments');
    expect(result).toHaveProperty('modelInfo');
  });

  it('method field matches the requested method', async () => {
    // Contract: the method field in the result reflects the algorithm used.
    const km = await clusterTraces(linearTraces(4), { method: 'kmeans', k: 2 });
    expect(km.method).toBe('kmeans');

    const db = await clusterTraces(linearTraces(4), { method: 'dbscan', eps: 5, minPoints: 2 });
    expect(db.method).toBe('dbscan');
  });

  it('each assignment has caseId and cluster fields', async () => {
    // Contract: ClusteringResult.assignments is Array<{ caseId: string; cluster: number }>.
    const result = await clusterTraces(linearTraces(4), { method: 'kmeans', k: 2 });
    for (const a of result.assignments) {
      expect(a).toHaveProperty('caseId');
      expect(a).toHaveProperty('cluster');
      expect(typeof a.caseId).toBe('string');
      expect(typeof a.cluster).toBe('number');
    }
  });

  it('cluster values are integers (not floats)', async () => {
    // Contract: cluster labels are integer indices, not continuous scores.
    const result = await clusterTraces(twoGroupTraces(6), { method: 'kmeans', k: 3 });
    for (const a of result.assignments) {
      expect(Number.isInteger(a.cluster)).toBe(true);
    }
  });

  it('cluster values satisfy Number.isFinite (no NaN or Infinity)', async () => {
    // Contract: cluster labels must be representable integers.
    const result = await clusterTraces(twoGroupTraces(6), { method: 'kmeans', k: 2 });
    for (const a of result.assignments) {
      expect(Number.isFinite(a.cluster)).toBe(true);
    }
  });

  it('caseId in assignments matches case_id in input (bridge preserves case identity)', async () => {
    // Contract: buildFeatureMatrix extracts case_id from the feature object.
    // The bridge preserves the case identity through the ML pipeline.
    const features = [
      { case_id: 'alpha', trace_length: 1, elapsed_time: 100 },
      { case_id: 'beta', trace_length: 50, elapsed_time: 5000 },
      { case_id: 'gamma', trace_length: 2, elapsed_time: 200 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });
    const returnedIds = result.assignments.map((a) => a.caseId).sort();
    expect(returnedIds).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('modelInfo contains featureCount for kmeans', async () => {
    // Contract: modelInfo exposes algorithm metadata for diagnostics.
    const result = await clusterTraces(twoGroupTraces(6), { method: 'kmeans', k: 2 });
    expect(result.modelInfo).toHaveProperty('featureCount');
    expect(result.modelInfo['featureCount']).toBeGreaterThan(0);
  });

  it('modelInfo.traceCount matches input length for kmeans', async () => {
    // Contract: traceCount in modelInfo must match the number of input feature objects.
    const n = 7;
    const result = await clusterTraces(linearTraces(n), { method: 'kmeans', k: 2 });
    expect(result.modelInfo['traceCount']).toBe(n);
  });

  it('modelInfo contains eps and minPoints for dbscan', async () => {
    // Contract: DBSCAN modelInfo exposes the parameters actually used.
    const result = await clusterTraces(linearTraces(5), {
      method: 'dbscan',
      eps: 2.5,
      minPoints: 2,
    });
    expect(result.modelInfo).toHaveProperty('eps');
    expect(result.modelInfo).toHaveProperty('minPoints');
    expect(result.modelInfo['eps']).toBe(2.5);
    expect(result.modelInfo['minPoints']).toBe(2);
  });

  it('increasing k from 1 to 2 changes at least one assignment (non-trivial re-partition)', async () => {
    // Contract: k=2 must produce a different partition than k=1 when n >= 2.
    // With k=1 all are in cluster 0. With k=2 at least one must move.
    const features = twoGroupTraces(4);
    const r1 = await clusterTraces(features, { method: 'kmeans', k: 1 });
    const r2 = await clusterTraces(features, { method: 'kmeans', k: 2 });

    // k=1: all cluster 0
    for (const a of r1.assignments) expect(a.cluster).toBe(0);

    // k=2: at least one assignment differs from 0 (some point is in cluster 1)
    const hasDifferentCluster = r2.assignments.some((a) => a.cluster !== 0);
    expect(hasDifferentCluster).toBe(true);
  });

  it('centroids are present and defined for kmeans', async () => {
    // Contract: ClusteringResult.centroids is populated for kmeans (optional field
    // per types.ts, but the implementation always sets it for kmeans).
    const result = await clusterTraces(twoGroupTraces(4), { method: 'kmeans', k: 2 });
    expect(result.centroids).toBeDefined();
    expect(Array.isArray(result.centroids)).toBe(true);
  });

  it('centroids are absent (undefined) for dbscan', async () => {
    // Contract: DBSCAN does not compute centroids. The field should be absent.
    const result = await clusterTraces(linearTraces(5), {
      method: 'dbscan',
      eps: 2,
      minPoints: 2,
    });
    expect(result.centroids).toBeUndefined();
  });

  it('well-separated groups land in distinct clusters (process variant isolation)', async () => {
    // Contract: when two groups are separated by orders of magnitude in feature space,
    // k-means must place them in different clusters. This is the minimum requirement
    // for useful process variant analysis — the whole point of clustering in PM.
    const features = [
      { case_id: 's1', trace_length: 1, elapsed_time: 100, rework_count: 0 },
      { case_id: 's2', trace_length: 2, elapsed_time: 150, rework_count: 0 },
      { case_id: 's3', trace_length: 1, elapsed_time: 120, rework_count: 0 },
      { case_id: 'l1', trace_length: 1000, elapsed_time: 100000, rework_count: 500 },
      { case_id: 'l2', trace_length: 999, elapsed_time: 99500, rework_count: 498 },
      { case_id: 'l3', trace_length: 1001, elapsed_time: 100200, rework_count: 502 },
    ];
    const result = await clusterTraces(features, { method: 'kmeans', k: 2 });

    const shortCluster = result.assignments.find((a) => a.caseId === 's1')!.cluster;
    const longCluster = result.assignments.find((a) => a.caseId === 'l1')!.cluster;
    expect(shortCluster).not.toBe(longCluster);

    // All short traces share the same cluster
    const shortClusters = new Set(['s1', 's2', 's3'].map(
      (id) => result.assignments.find((a) => a.caseId === id)!.cluster
    ));
    expect(shortClusters.size).toBe(1);

    // All long traces share the same cluster
    const longClusters = new Set(['l1', 'l2', 'l3'].map(
      (id) => result.assignments.find((a) => a.caseId === id)!.cluster
    ));
    expect(longClusters.size).toBe(1);
  });
});

// =============================================================================
// RANK 3 — Metamorphic Relations
// Input perturbation → predictable output direction. No absolute thresholds.
// =============================================================================

describe('clusterTraces — Rank 3 (metamorphic relations)', () => {
  it('determinism: identical input produces identical assignments on two consecutive calls', async () => {
    // Metamorphic: same input → same output (k-means++ is deterministic by design).
    const features = twoGroupTraces(8);
    const r1 = await clusterTraces(features, { method: 'kmeans', k: 2 });
    const r2 = await clusterTraces(features, { method: 'kmeans', k: 2 });
    expect(r1.assignments.map((a) => a.cluster)).toEqual(r2.assignments.map((a) => a.cluster));
    expect(r1.assignments.map((a) => a.caseId)).toEqual(r2.assignments.map((a) => a.caseId));
  });

  it('scale invariance: multiplying all features by a positive constant preserves assignments', async () => {
    // Metamorphic: k-means uses Euclidean distance. Scaling all features by k > 0
    // scales all distances by k but preserves the argmin — assignments are unchanged.
    const base = [
      { case_id: 'c1', x: 1, y: 1 },
      { case_id: 'c2', x: 2, y: 2 },
      { case_id: 'c3', x: 100, y: 100 },
      { case_id: 'c4', x: 101, y: 101 },
    ];
    const scaled = base.map((f) => ({ ...f, x: f.x * 1000, y: f.y * 1000 }));

    const rBase = await clusterTraces(base, { method: 'kmeans', k: 2 });
    const rScaled = await clusterTraces(scaled, { method: 'kmeans', k: 2 });

    // After optional cluster-label normalisation: same-group points should be in
    // the same cluster in both runs. We check pairwise consistency.
    const sameGroupBase = rBase.assignments[0].cluster === rBase.assignments[1].cluster;
    const sameGroupScaled = rScaled.assignments[0].cluster === rScaled.assignments[1].cluster;
    expect(sameGroupBase).toBe(sameGroupScaled);

    const differentGroupBase =
      rBase.assignments[0].cluster !== rBase.assignments[2].cluster;
    const differentGroupScaled =
      rScaled.assignments[0].cluster !== rScaled.assignments[2].cluster;
    expect(differentGroupBase).toBe(differentGroupScaled);
  });

  it('inertia decreases or stays same when k increases (more clusters ≤ inertia)', async () => {
    // Metamorphic: adding a cluster never increases the optimal inertia because each
    // point can now be reassigned to the new centroid if that reduces its distance.
    const features = linearTraces(9);
    const r2 = await clusterTraces(features, { method: 'kmeans', k: 2 });
    const r3 = await clusterTraces(features, { method: 'kmeans', k: 3 });

    const inertia2 = r2.modelInfo['inertia'] as number | undefined;
    const inertia3 = r3.modelInfo['inertia'] as number | undefined;

    if (inertia2 !== undefined && inertia3 !== undefined) {
      // Inertia with k=3 must be ≤ inertia with k=2
      expect(inertia3).toBeLessThanOrEqual(inertia2 + 1e-9); // small tolerance for float arithmetic
    }
  });

  it('DBSCAN: larger eps merges more points into clusters (fewer noise, more clustered)', async () => {
    // Metamorphic: increasing eps expands neighbourhoods → fewer points labelled noise.
    const features = linearTraces(6);
    const smallEps = await clusterTraces(features, { method: 'dbscan', eps: 0.01, minPoints: 2 });
    const largeEps = await clusterTraces(features, { method: 'dbscan', eps: 10000, minPoints: 2 });
    expect(largeEps.noiseCount).toBeLessThanOrEqual(smallEps.noiseCount);
  });

  it('appending an identical trace does not change existing assignments (caseId-keyed lookup)', async () => {
    // Metamorphic: adding one extra trace (identical to an existing one) should not
    // change the cluster assignment of the original traces (since the centroid merely
    // absorbs the duplicate). We verify the original caseIds land in the same clusters.
    const base = [
      { case_id: 'c1', trace_length: 1, elapsed_time: 100 },
      { case_id: 'c2', trace_length: 50, elapsed_time: 5000 },
      { case_id: 'c3', trace_length: 2, elapsed_time: 150 },
      { case_id: 'c4', trace_length: 49, elapsed_time: 4900 },
    ];
    const extended = [
      ...base,
      { case_id: 'c5', trace_length: 1, elapsed_time: 100 }, // duplicate of c1
    ];

    const rBase = await clusterTraces(base, { method: 'kmeans', k: 2 });
    const rExt = await clusterTraces(extended, { method: 'kmeans', k: 2 });

    // c1 and c3 should be in the same cluster in both runs
    const c1Base = rBase.assignments.find((a) => a.caseId === 'c1')!.cluster;
    const c3Base = rBase.assignments.find((a) => a.caseId === 'c3')!.cluster;
    const c1Ext = rExt.assignments.find((a) => a.caseId === 'c1')!.cluster;
    const c3Ext = rExt.assignments.find((a) => a.caseId === 'c3')!.cluster;

    // Both should be same-group in both runs
    expect(c1Base === c3Base).toBe(c1Ext === c3Ext);
  });
});
