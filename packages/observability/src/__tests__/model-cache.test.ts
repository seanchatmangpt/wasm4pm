import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ModelCache,
  getModelCache,
  resetModelCache,
  type CachedModel,
} from '../discovery-cache.js';

describe('ModelCache', () => {
  let cache: ModelCache;

  beforeEach(() => {
    cache = new ModelCache(500, 48 * 60 * 60 * 1000); // 500 max entries, 48h TTL
    resetModelCache();
  });

  afterEach(() => {
    cache.clear();
    resetModelCache();
  });

  describe('getModel and caching', () => {
    it('should store and retrieve a cached model', () => {
      const key = 'dfg:log-123:params-456';
      const result = {
        handle: 'handle-dfg-123',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 150,
        hash: 'hash-dfg-abc',
        params: { activity_key: 'concept:name' },
      };

      cache.cacheDiscovery(key, result);

      const model = cache.getModel(key);
      expect(model).not.toBeNull();
      expect(model?.handle).toBe('handle-dfg-123');
      expect(model?.algorithm).toBe('dfg');
      expect(model?.durationMs).toBe(150);
      expect(model?.accessCount).toBe(1); // First access
    });

    it('should return null on model cache miss', () => {
      const model = cache.getModel('unknown-key');
      expect(model).toBeNull();
    });

    it('should increment access count on multiple retrievals', () => {
      const key = 'dfg:log-123:params-456';
      const result = {
        handle: 'handle-dfg-123',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 150,
        hash: 'hash-dfg-abc',
        params: { activity_key: 'concept:name' },
      };

      cache.cacheDiscovery(key, result);

      // First access
      const model1 = cache.getModel(key);
      expect(model1?.accessCount).toBe(1);

      // Second access
      const model2 = cache.getModel(key);
      expect(model2?.accessCount).toBe(2);

      // Third access
      const model3 = cache.getModel(key);
      expect(model3?.accessCount).toBe(3);
    });
  });

  describe('modelStats', () => {
    it('should report correct model statistics', () => {
      const key1 = 'dfg:log-123:params-456';
      const result1 = {
        handle: 'handle-dfg-123',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-dfg-abc',
        params: { activity_key: 'concept:name' },
      };

      const key2 = 'heuristic:log-456:params-789';
      const result2 = {
        handle: 'handle-heuristic-456',
        algorithm: 'heuristic_miner',
        outputType: 'dfg',
        durationMs: 300,
        hash: 'hash-heuristic-def',
        params: { activity_key: 'concept:name', dependency_threshold: 0.3 },
      };

      cache.cacheDiscovery(key1, result1);
      cache.cacheDiscovery(key2, result2);

      // Access first model twice
      cache.getModel(key1);
      cache.getModel(key1);

      // Access second model once
      cache.getModel(key2);

      const stats = cache.modelStats();
      expect(stats.models).toBe(2);
      expect(stats.total_hits).toBe(3); // 2 hits on dfg + 1 hit on heuristic
      expect(stats.hit_rate).toBeGreaterThan(0.5); // Hits / (hits + misses)
    });

    it('should calculate time saved from cache hits', () => {
      const key = 'dfg:log-123:params-456';
      const result = {
        handle: 'handle-dfg-123',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 150,
        hash: 'hash-dfg-abc',
        params: { activity_key: 'concept:name' },
      };

      cache.cacheDiscovery(key, result);

      // Access 2 times via getModel: first call increments to 1, second to 2
      // Time saved should be: 150 * (2 - 1) = 150ms (one avoided computation)
      cache.getModel(key);
      cache.getModel(key);

      const stats = cache.modelStats();
      expect(stats.time_saved_ms).toBe(150); // 150ms * 1 additional access
    });

    it('should estimate memory usage', () => {
      const key = 'dfg:log-123:params-456';
      const result = {
        handle: 'handle-dfg-123',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 150,
        hash: 'hash-dfg-abc',
        params: { activity_key: 'concept:name' },
      };

      cache.cacheDiscovery(key, result);

      const stats = cache.modelStats();
      expect(stats.bytes_used).toBeGreaterThan(0);
      expect(stats.bytes_used).toBeGreaterThanOrEqual(332); // Rough estimate per entry
    });

    it('should track hit rate correctly', () => {
      const key1 = 'dfg:log-123:params-456';
      const result1 = {
        handle: 'handle-dfg-123',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 150,
        hash: 'hash-dfg-abc',
        params: { activity_key: 'concept:name' },
      };

      cache.cacheDiscovery(key1, result1);

      // 2 hits
      cache.getModel(key1);
      cache.getModel(key1);

      // 2 misses
      cache.getModel('unknown-1');
      cache.getModel('unknown-2');

      const stats = cache.modelStats();
      expect(stats.total_hits).toBe(2);
      expect(stats.total_misses).toBe(2);
      expect(stats.hit_rate).toBe(0.5); // 2 / (2 + 2)
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when capacity exceeded', () => {
      const smallCache = new ModelCache(3, 10000); // 3 max entries

      const key1 = 'algo1:log:params1';
      const key2 = 'algo2:log:params2';
      const key3 = 'algo3:log:params3';
      const key4 = 'algo4:log:params4';

      const result = {
        handle: 'handle',
        algorithm: 'test',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash',
        params: {},
      };

      smallCache.cacheDiscovery(key1, { ...result, algorithm: 'algo1' });
      smallCache.cacheDiscovery(key2, { ...result, algorithm: 'algo2' });
      smallCache.cacheDiscovery(key3, { ...result, algorithm: 'algo3' });

      let stats = smallCache.modelStats();
      expect(stats.models).toBe(3);

      // Adding a 4th entry should evict the oldest (key1)
      smallCache.cacheDiscovery(key4, { ...result, algorithm: 'algo4' });

      stats = smallCache.modelStats();
      expect(stats.models).toBe(3);

      // key1 should be evicted
      expect(smallCache.getModel(key1)).toBeNull();

      // Others should still be available
      expect(smallCache.getModel(key2)).not.toBeNull();
      expect(smallCache.getModel(key3)).not.toBeNull();
      expect(smallCache.getModel(key4)).not.toBeNull();
    });
  });

  describe('global singleton', () => {
    it('should return the same instance across calls', () => {
      resetModelCache();

      const cache1 = getModelCache();
      const cache2 = getModelCache();

      expect(cache1).toBe(cache2);
    });

    it('should create a new instance after reset', () => {
      const cache1 = getModelCache();

      const key = 'test:log:params';
      const result = {
        handle: 'handle',
        algorithm: 'test',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash',
        params: {},
      };
      cache1.cacheDiscovery(key, result);

      expect(cache1.getModel(key)).not.toBeNull();

      resetModelCache();
      const cache2 = getModelCache();

      // New instance should be empty
      expect(cache2.getModel(key)).toBeNull();
    });
  });

  describe('clear and invalidation', () => {
    it('should clear all cached models', () => {
      const key1 = 'dfg:log:params1';
      const key2 = 'heuristic:log:params2';

      const result = {
        handle: 'handle',
        algorithm: 'test',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash',
        params: {},
      };

      cache.cacheDiscovery(key1, { ...result, algorithm: 'dfg' });
      cache.cacheDiscovery(key2, { ...result, algorithm: 'heuristic_miner' });

      let stats = cache.modelStats();
      expect(stats.models).toBe(2);

      cache.clear();

      stats = cache.modelStats();
      expect(stats.models).toBe(0);
      expect(stats.total_hits).toBe(0);
      expect(stats.total_misses).toBe(0);
    });

    it('should invalidate by algorithm', () => {
      const key1 = 'dfg:log:params1';
      const key2 = 'dfg:log:params2';
      const key3 = 'heuristic:log:params3';

      const result = {
        handle: 'handle',
        algorithm: 'test',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash',
        params: {},
      };

      cache.cacheDiscovery(key1, { ...result, algorithm: 'dfg' });
      cache.cacheDiscovery(key2, { ...result, algorithm: 'dfg' });
      cache.cacheDiscovery(key3, { ...result, algorithm: 'heuristic_miner' });

      let stats = cache.modelStats();
      expect(stats.models).toBe(3);

      const removed = cache.invalidateByAlgorithm('dfg');
      expect(removed).toBe(2);

      stats = cache.modelStats();
      expect(stats.models).toBe(1);

      // DFG models should be gone
      expect(cache.getModel(key1)).toBeNull();
      expect(cache.getModel(key2)).toBeNull();

      // Heuristic model should remain
      expect(cache.getModel(key3)).not.toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('should expire models after TTL', async () => {
      const key = 'dfg:log:params';
      const shortTtl = 100; // 100ms

      const result = {
        handle: 'handle',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash',
        params: {},
      };

      cache.cacheDiscovery(key, result, shortTtl);

      // Should be available immediately
      expect(cache.getModel(key)).not.toBeNull();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired
      expect(cache.getModel(key)).toBeNull();
    });
  });

  describe('model metadata', () => {
    it('should include all required model metadata', () => {
      const key = 'genetic:log:params';
      const result = {
        handle: 'handle-genetic-xyz',
        algorithm: 'genetic_algorithm',
        outputType: 'petrinet',
        durationMs: 500,
        hash: 'hash-genetic-xyz',
        params: { population_size: 20, iterations: 50 },
      };

      cache.cacheDiscovery(key, result);

      const model = cache.getModel(key) as CachedModel;
      expect(model.handle).toBe('handle-genetic-xyz');
      expect(model.algorithm).toBe('genetic_algorithm');
      expect(model.outputType).toBe('petrinet');
      expect(model.durationMs).toBe(500);
      expect(model.hash).toBe('hash-genetic-xyz');
      expect(model.params).toEqual({ population_size: 20, iterations: 50 });
      expect(model.cachedAt).toBeGreaterThan(0); // Timestamp
      expect(model.accessCount).toBe(1);
    });
  });
});
