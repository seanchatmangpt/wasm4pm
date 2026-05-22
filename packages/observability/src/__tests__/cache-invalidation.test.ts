import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  computeParamHash,
  shouldInvalidate,
  AlgorithmCacheInvalidator,
  getAlgorithmCacheInvalidator,
  resetAlgorithmCacheInvalidator,
} from '../cache-invalidation.js';

describe('cache-invalidation', () => {
  afterEach(() => {
    resetAlgorithmCacheInvalidator();
  });

  describe('computeParamHash', () => {
    it('should return a consistent hash for the same params', () => {
      const params = { dependency_threshold: 0.2, activity_key: 'concept:name' };
      const hash1 = computeParamHash(params);
      const hash2 = computeParamHash(params);
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different params', () => {
      const params1 = { dependency_threshold: 0.2 };
      const params2 = { dependency_threshold: 0.3 };
      const hash1 = computeParamHash(params1);
      const hash2 = computeParamHash(params2);
      expect(hash1).not.toBe(hash2);
    });

    it('should be order-independent (keys sorted before hashing)', () => {
      const params1 = { threshold: 0.2, key: 'name', timeout: 1000 };
      const params2 = { timeout: 1000, threshold: 0.2, key: 'name' };
      const hash1 = computeParamHash(params1);
      const hash2 = computeParamHash(params2);
      expect(hash1).toBe(hash2);
    });

    it('should handle nested objects correctly', () => {
      const params1 = { config: { nested: true, value: 42 } };
      const params2 = { config: { nested: true, value: 42 } };
      const hash1 = computeParamHash(params1);
      const hash2 = computeParamHash(params2);
      expect(hash1).toBe(hash2);
    });

    it('should handle empty params', () => {
      const hash = computeParamHash({});
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA256 hex digest is 64 chars
    });

    it('should handle numeric and string types', () => {
      const params1 = { threshold: 0.2, count: 10, name: 'algo' };
      const params2 = { threshold: 0.2, count: 10, name: 'algo' };
      const hash1 = computeParamHash(params1);
      const hash2 = computeParamHash(params2);
      expect(hash1).toBe(hash2);
    });

    it('should distinguish between null and undefined', () => {
      const params1 = { value: null };
      const params2 = { value: undefined };
      const hash1 = computeParamHash(params1);
      const hash2 = computeParamHash(params2);
      expect(hash1).not.toBe(hash2);
    });

    it('should return hex-encoded string', () => {
      const hash = computeParamHash({ test: 123 });
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('should be 64 characters (SHA256)', () => {
      const hash = computeParamHash({ test: true });
      expect(hash).toHaveLength(64);
    });
  });

  describe('shouldInvalidate', () => {
    it('should return false when no previous hash exists', () => {
      const newHash = computeParamHash({ threshold: 0.2 });
      expect(shouldInvalidate(undefined, newHash)).toBe(false);
    });

    it('should return false when hashes match', () => {
      const hash = computeParamHash({ threshold: 0.2 });
      expect(shouldInvalidate(hash, hash)).toBe(false);
    });

    it('should return true when hashes differ', () => {
      const hash1 = computeParamHash({ threshold: 0.2 });
      const hash2 = computeParamHash({ threshold: 0.3 });
      expect(shouldInvalidate(hash1, hash2)).toBe(true);
    });

    it('should treat empty string oldHash as no previous hash', () => {
      const newHash = computeParamHash({ test: 1 });
      // Empty string is falsy, so should return false (no invalidation needed for first entry)
      expect(shouldInvalidate('', newHash)).toBe(false);
    });
  });

  describe('AlgorithmCacheInvalidator', () => {
    let invalidator: AlgorithmCacheInvalidator;

    beforeEach(() => {
      invalidator = new AlgorithmCacheInvalidator();
    });

    describe('trackEntry and getEntry', () => {
      it('should track and retrieve an entry', () => {
        const algo = 'dfg';
        const paramHash = computeParamHash({ threshold: 0.2 });
        const entry = {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash,
          fitness: 0.85,
          precision: 0.80,
          timestamp: Date.now(),
          algorithm: algo,
        };

        invalidator.trackEntry(algo, paramHash, entry);
        const retrieved = invalidator.getEntry(algo, paramHash);

        expect(retrieved).toEqual(entry);
      });

      it('should return undefined for non-existent entries', () => {
        const retrieved = invalidator.getEntry('unknown', 'unknown');
        expect(retrieved).toBeUndefined();
      });

      it('should handle multiple param hashes for same algorithm', () => {
        const algo = 'heuristic_miner';
        const hash1 = computeParamHash({ threshold: 0.2 });
        const hash2 = computeParamHash({ threshold: 0.3 });

        const entry1 = {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash1,
          fitness: 0.85,
          precision: 0.80,
          timestamp: Date.now(),
          algorithm: algo,
        };

        const entry2 = {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash2,
          fitness: 0.90,
          precision: 0.85,
          timestamp: Date.now(),
          algorithm: algo,
        };

        invalidator.trackEntry(algo, hash1, entry1);
        invalidator.trackEntry(algo, hash2, entry2);

        expect(invalidator.getEntry(algo, hash1)).toEqual(entry1);
        expect(invalidator.getEntry(algo, hash2)).toEqual(entry2);
      });

      it('should handle multiple algorithms', () => {
        const hash1 = computeParamHash({ threshold: 0.2 });
        const hash2 = computeParamHash({ threshold: 0.2 });

        const entry1 = {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash1,
          fitness: 0.85,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'dfg',
        };

        const entry2 = {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash2,
          fitness: 0.90,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'inductive_miner',
        };

        invalidator.trackEntry('dfg', hash1, entry1);
        invalidator.trackEntry('inductive_miner', hash2, entry2);

        expect(invalidator.getEntry('dfg', hash1)).toEqual(entry1);
        expect(invalidator.getEntry('inductive_miner', hash2)).toEqual(entry2);
      });
    });

    describe('invalidateAlgorithm', () => {
      it('should invalidate all entries for an algorithm', () => {
        const algo = 'dfg';
        const hash1 = computeParamHash({ threshold: 0.2 });
        const hash2 = computeParamHash({ threshold: 0.3 });

        invalidator.trackEntry(algo, hash1, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash1,
          fitness: 0.85,
          precision: null,
          timestamp: Date.now(),
          algorithm: algo,
        });

        invalidator.trackEntry(algo, hash2, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash2,
          fitness: 0.90,
          precision: null,
          timestamp: Date.now(),
          algorithm: algo,
        });

        const removed = invalidator.invalidateAlgorithm(algo);
        expect(removed).toBe(2);
        expect(invalidator.getEntry(algo, hash1)).toBeUndefined();
        expect(invalidator.getEntry(algo, hash2)).toBeUndefined();
      });

      it('should return 0 when invalidating non-existent algorithm', () => {
        const removed = invalidator.invalidateAlgorithm('unknown');
        expect(removed).toBe(0);
      });

      it('should not affect other algorithms', () => {
        const hash1 = computeParamHash({ threshold: 0.2 });
        const hash2 = computeParamHash({ threshold: 0.2 });

        const entry1 = {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash1,
          fitness: 0.85,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'dfg',
        };

        const entry2 = {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash2,
          fitness: 0.90,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'heuristic_miner',
        };

        invalidator.trackEntry('dfg', hash1, entry1);
        invalidator.trackEntry('heuristic_miner', hash2, entry2);

        invalidator.invalidateAlgorithm('dfg');

        expect(invalidator.getEntry('dfg', hash1)).toBeUndefined();
        expect(invalidator.getEntry('heuristic_miner', hash2)).toEqual(entry2);
      });
    });

    describe('invalidateEntry', () => {
      it('should invalidate a specific entry', () => {
        const algo = 'dfg';
        const hash1 = computeParamHash({ threshold: 0.2 });
        const hash2 = computeParamHash({ threshold: 0.3 });

        invalidator.trackEntry(algo, hash1, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash1,
          fitness: 0.85,
          precision: null,
          timestamp: Date.now(),
          algorithm: algo,
        });

        invalidator.trackEntry(algo, hash2, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash2,
          fitness: 0.90,
          precision: null,
          timestamp: Date.now(),
          algorithm: algo,
        });

        const removed = invalidator.invalidateEntry(algo, hash1);
        expect(removed).toBe(true);
        expect(invalidator.getEntry(algo, hash1)).toBeUndefined();
        expect(invalidator.getEntry(algo, hash2)).toBeDefined();
      });

      it('should return false when entry does not exist', () => {
        const removed = invalidator.invalidateEntry('dfg', 'unknown');
        expect(removed).toBe(false);
      });
    });

    describe('getTrackedAlgorithms', () => {
      it('should return empty array when no algorithms tracked', () => {
        const algos = invalidator.getTrackedAlgorithms();
        expect(algos).toEqual([]);
      });

      it('should return all tracked algorithms', () => {
        const hash = computeParamHash({ threshold: 0.2 });

        const entry1 = {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash,
          fitness: 0.85,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'dfg',
        };

        const entry2 = {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash,
          fitness: 0.90,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'heuristic_miner',
        };

        invalidator.trackEntry('dfg', hash, entry1);
        invalidator.trackEntry('heuristic_miner', hash, entry2);

        const algos = invalidator.getTrackedAlgorithms().sort();
        expect(algos).toEqual(['dfg', 'heuristic_miner']);
      });
    });

    describe('getParamHashesForAlgorithm', () => {
      it('should return empty array for non-existent algorithm', () => {
        const hashes = invalidator.getParamHashesForAlgorithm('unknown');
        expect(hashes).toEqual([]);
      });

      it('should return all param hashes for an algorithm', () => {
        const algo = 'dfg';
        const hash1 = computeParamHash({ threshold: 0.2 });
        const hash2 = computeParamHash({ threshold: 0.3 });

        invalidator.trackEntry(algo, hash1, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash1,
          fitness: 0.85,
          precision: null,
          timestamp: Date.now(),
          algorithm: algo,
        });

        invalidator.trackEntry(algo, hash2, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash2,
          fitness: 0.90,
          precision: null,
          timestamp: Date.now(),
          algorithm: algo,
        });

        const hashes = invalidator.getParamHashesForAlgorithm(algo);
        expect(hashes).toHaveLength(2);
        expect(hashes).toContain(hash1);
        expect(hashes).toContain(hash2);
      });
    });

    describe('clear', () => {
      it('should clear all tracked entries', () => {
        const hash = computeParamHash({ threshold: 0.2 });

        invalidator.trackEntry('dfg', hash, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash,
          fitness: 0.85,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'dfg',
        });

        invalidator.clear();

        expect(invalidator.getTrackedAlgorithms()).toEqual([]);
        expect(invalidator.getParamHashesForAlgorithm('dfg')).toEqual([]);
      });
    });

    describe('stats', () => {
      it('should return correct statistics', () => {
        const hash1 = computeParamHash({ threshold: 0.2 });
        const hash2 = computeParamHash({ threshold: 0.3 });
        const hash3 = computeParamHash({ threshold: 0.2 });

        invalidator.trackEntry('dfg', hash1, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash1,
          fitness: 0.85,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'dfg',
        });

        invalidator.trackEntry('dfg', hash2, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash2,
          fitness: 0.90,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'dfg',
        });

        invalidator.trackEntry('heuristic_miner', hash3, {
          logHash: 'log1',
          modelHash: 'model1',
          paramHash: hash3,
          fitness: 0.88,
          precision: null,
          timestamp: Date.now(),
          algorithm: 'heuristic_miner',
        });

        const stats = invalidator.stats();
        expect(stats.totalAlgorithms).toBe(2);
        expect(stats.totalEntries).toBe(3);
        expect(stats.algorithmBreakdown['dfg']).toBe(2);
        expect(stats.algorithmBreakdown['heuristic_miner']).toBe(1);
      });

      it('should return zero stats for empty invalidator', () => {
        const stats = invalidator.stats();
        expect(stats.totalAlgorithms).toBe(0);
        expect(stats.totalEntries).toBe(0);
        expect(stats.algorithmBreakdown).toEqual({});
      });
    });
  });

  describe('Global singleton', () => {
    it('should return same instance on multiple calls', () => {
      resetAlgorithmCacheInvalidator();
      const inv1 = getAlgorithmCacheInvalidator();
      const inv2 = getAlgorithmCacheInvalidator();
      expect(inv1).toBe(inv2);
    });

    it('should be reset by resetAlgorithmCacheInvalidator', () => {
      const hash = computeParamHash({ threshold: 0.2 });
      const inv1 = getAlgorithmCacheInvalidator();

      inv1.trackEntry('dfg', hash, {
        logHash: 'log1',
        modelHash: 'model1',
        paramHash: hash,
        fitness: 0.85,
        precision: null,
        timestamp: Date.now(),
        algorithm: 'dfg',
      });

      resetAlgorithmCacheInvalidator();
      const inv2 = getAlgorithmCacheInvalidator();

      expect(inv2.getTrackedAlgorithms()).toEqual([]);
    });
  });
});
