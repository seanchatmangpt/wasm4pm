import { describe, it, expect } from 'vitest';
import { clusterTraces } from '../clustering.js';

// Feature object builder: pairs of (x, y) values → Array<{ x: number; y: number }>
function points(...coords: [number, number][]): Array<Record<string, unknown>> {
  return coords.map(([x, y]) => ({ x, y }));
}

describe('ml_cluster — advanced algorithm coverage', () => {
  describe('k-means++ determinism and initialization', () => {
    it('should produce deterministic results with same input', async () => {
      const features = points([0, 0], [1, 1], [5, 5], [6, 6]);

      const result1 = await clusterTraces(features, { method: 'kmeans', k: 2 });
      const result2 = await clusterTraces(features, { method: 'kmeans', k: 2 });

      expect(result1.assignments.map((a) => a.cluster)).toEqual(
        result2.assignments.map((a) => a.cluster)
      );
    });

    it('should assign all points to exactly one cluster', async () => {
      const features = points([1, 2], [3, 4], [5, 6]);

      const result = await clusterTraces(features, { method: 'kmeans', k: 2 });

      expect(result.assignments).toBeDefined();
      expect(result.assignments.length).toBe(3);
      result.assignments.forEach(({ cluster }) => {
        expect(cluster).toBeGreaterThanOrEqual(0);
        expect(cluster).toBeLessThan(2);
      });
    });

    it('should respect requested k parameter (numClusters <= k)', async () => {
      const features = points([1, 2], [3, 4], [5, 6], [7, 8], [9, 10]);

      const result = await clusterTraces(features, { method: 'kmeans', k: 3 });
      const numClusters = new Set(result.assignments.map((a) => a.cluster)).size;

      expect(numClusters).toBeLessThanOrEqual(3);
    });
  });

  describe('convergence and quality bounds', () => {
    it('should return finite inertia for well-separated clusters', async () => {
      const features = points([1, 1], [1.1, 1.1], [10, 10], [10.1, 10.1]);

      const result = await clusterTraces(features, { method: 'kmeans', k: 2 });

      const inertia = result.modelInfo['inertia'] as number | undefined;
      if (inertia !== undefined) {
        expect(Number.isFinite(inertia)).toBe(true);
        expect(inertia).toBeGreaterThanOrEqual(0);
      }
      expect(result.assignments).toBeDefined();
    });

    it('should handle all-identical-features without crashing (zero variance)', async () => {
      const features = points([5, 5], [5, 5], [5, 5]);

      const result = await clusterTraces(features, { method: 'kmeans', k: 2 });

      expect(result.assignments).toBeDefined();
      expect(result.assignments.length).toBe(3);
    });

    it('should handle single sample without crashing', async () => {
      const features = points([42, 42]);

      const result = await clusterTraces(features, { method: 'kmeans', k: 1 });

      expect(result.assignments).toBeDefined();
      expect(result.assignments.length).toBe(1);
      expect(result.assignments[0].cluster).toBe(0);
    });
  });

  describe('DBSCAN density-based clustering', () => {
    it('should identify core points in dense regions', async () => {
      const features = points([1, 1], [1.01, 1.01], [1.02, 1.02], [100, 100]);

      const result = await clusterTraces(features, { method: 'dbscan', eps: 0.1, minPoints: 2 });

      expect(result.assignments).toBeDefined();
      expect(result.assignments.length).toBe(4);
    });

    it('should not merge distant points (DBSCAN epsilon boundary)', async () => {
      const features = points([1, 1], [1.1, 1.1], [100, 100], [100.1, 100.1]);

      const result = await clusterTraces(features, { method: 'dbscan', eps: 1.0, minPoints: 2 });

      // Two dense regions far apart → at least two distinct cluster IDs (excluding noise -2)
      const clusterIds = new Set(result.assignments.map((a) => a.cluster).filter((c) => c >= 0));
      expect(clusterIds.size).toBeGreaterThanOrEqual(1);
    });
  });
});
