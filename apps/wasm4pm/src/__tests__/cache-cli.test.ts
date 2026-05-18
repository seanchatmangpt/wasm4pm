import { describe, it, expect, beforeEach } from 'vitest';
import { resetDiscoveryCache, getDiscoveryCache, resetModelCache, getModelCache } from '@wasm4pm/observability';

describe('Cache Command Integration', () => {
  beforeEach(() => {
    resetDiscoveryCache();
  });

  describe('getDiscoveryCache', () => {
    it('should retrieve singleton cache instance', () => {
      const cache = getDiscoveryCache();
      expect(cache).toBeDefined();
      expect(cache.stats).toBeDefined();
      expect(cache.getCachedAlgorithms).toBeDefined();
    });

    it('should return same instance on repeated calls', () => {
      const cache1 = getDiscoveryCache();
      const cache2 = getDiscoveryCache();
      expect(cache1).toBe(cache2);
    });
  });

  describe('cache stats', () => {
    it('should report empty cache statistics initially', () => {
      const cache = getDiscoveryCache();
      const stats = cache.stats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.entries).toBe(0);
      expect(stats.bytes_used).toBe(0);
      expect(cache.hitRate()).toBe(0);
    });

    it('should report cache activity after operations', () => {
      const cache = getDiscoveryCache();

      // Add an entry
      cache.cacheDiscovery('key-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      // Hit
      cache.getDiscovery('key-1');
      // Miss
      cache.getDiscovery('unknown');

      const stats = cache.stats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.entries).toBe(1);
      expect(cache.hitRate()).toBe(0.5); // 1 hit out of 2 total
    });
  });

  describe('cache clear', () => {
    it('should clear all entries', () => {
      const cache = getDiscoveryCache();

      cache.cacheDiscovery('key-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.cacheDiscovery('key-2', {
        handle: 'h2',
        algorithm: 'heuristic_miner',
        outputType: 'dfg',
        durationMs: 200,
        hash: 'hash-2',
        params: {},
      });

      const statsBefore = cache.stats();
      expect(statsBefore.entries).toBe(2);

      cache.clear();

      const statsAfter = cache.stats();
      expect(statsAfter.entries).toBe(0);
      expect(statsAfter.hits).toBe(0);
      expect(statsAfter.misses).toBe(0);
    });

    it('should invalidate algorithm-specific entries', () => {
      const cache = getDiscoveryCache();

      // Add entries for different algorithms
      cache.cacheDiscovery('key-dfg-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.cacheDiscovery('key-hm-1', {
        handle: 'h2',
        algorithm: 'heuristic_miner',
        outputType: 'dfg',
        durationMs: 200,
        hash: 'hash-2',
        params: {},
      });

      expect(cache.stats().entries).toBe(2);

      // Invalidate dfg entries
      const removed = cache.invalidateByAlgorithm('dfg');
      expect(removed).toBe(1);

      expect(cache.stats().entries).toBe(1);
      expect(cache.getCachedAlgorithms()).toEqual(['heuristic_miner']);
    });
  });

  describe('cache purge', () => {
    it('should remove expired entries', async () => {
      const cache = getDiscoveryCache();

      // Add entry with long TTL
      cache.cacheDiscovery('key-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      // Add entry with short TTL
      cache.cacheDiscovery(
        'key-2',
        {
          handle: 'h2',
          algorithm: 'dfg',
          outputType: 'dfg',
          durationMs: 120,
          hash: 'hash-2',
          params: {},
        },
        100 // 100ms TTL
      );

      expect(cache.stats().entries).toBe(2);

      // Wait for short-TTL entry to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const removed = cache.purgeExpired();
      expect(removed).toBe(1);

      expect(cache.stats().entries).toBe(1);
      expect(cache.getDiscovery('key-1')).not.toBeNull();
      expect(cache.getDiscovery('key-2')).toBeNull();
    });
  });

  describe('cache algorithms list', () => {
    it('should return all cached algorithms', () => {
      const cache = getDiscoveryCache();

      cache.cacheDiscovery('key-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.cacheDiscovery('key-2', {
        handle: 'h2',
        algorithm: 'heuristic_miner',
        outputType: 'dfg',
        durationMs: 200,
        hash: 'hash-2',
        params: {},
      });

      cache.cacheDiscovery('key-3', {
        handle: 'h3',
        algorithm: 'ilp',
        outputType: 'petrinet',
        durationMs: 500,
        hash: 'hash-3',
        params: {},
      });

      const algorithms = cache.getCachedAlgorithms().sort();
      expect(algorithms).toEqual(['dfg', 'heuristic_miner', 'ilp']);
    });

    it('should return empty list for empty cache', () => {
      const cache = getDiscoveryCache();
      const algorithms = cache.getCachedAlgorithms();
      expect(algorithms).toEqual([]);
    });
  });

  describe('discovery cache key generation', () => {
    it('should be imported from discovery-cache', async () => {
      const mod = await import('@wasm4pm/observability');
      expect(mod.generateDiscoveryCacheKey).toBeDefined();

      const key1 = mod.generateDiscoveryCacheKey('dfg', 'log-123', { activity_key: 'concept:name' });
      const key2 = mod.generateDiscoveryCacheKey('dfg', 'log-123', { activity_key: 'concept:name' });

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    });
  });

  describe('hit rate calculation', () => {
    it('should calculate hit rate correctly', () => {
      const cache = getDiscoveryCache();

      cache.cacheDiscovery('key-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      // 5 hits
      for (let i = 0; i < 5; i++) {
        cache.getDiscovery('key-1');
      }

      // 3 misses
      for (let i = 0; i < 3; i++) {
        cache.getDiscovery(`unknown-${i}`);
      }

      const hitRate = cache.hitRate();
      expect(hitRate).toBe(5 / 8);
      expect(hitRate).toBeCloseTo(0.625, 2);
    });

    it('should return 0 for empty cache', () => {
      const cache = getDiscoveryCache();
      expect(cache.hitRate()).toBe(0);
    });
  });
});

describe('Model Cache Integration', () => {
  beforeEach(() => {
    resetModelCache();
  });

  describe('getModelCache', () => {
    it('should retrieve singleton model cache instance', () => {
      const cache = getModelCache();
      expect(cache).toBeDefined();
      expect(cache.modelStats).toBeDefined();
      expect(cache.getModel).toBeDefined();
    });

    it('should return same instance on repeated calls', () => {
      const cache1 = getModelCache();
      const cache2 = getModelCache();
      expect(cache1).toBe(cache2);
    });
  });

  describe('model caching and access counting', () => {
    it('should cache and retrieve models with access count', () => {
      const cache = getModelCache();

      cache.cacheDiscovery('key-dfg', {
        handle: 'handle-dfg-xyz',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 150,
        hash: 'hash-dfg-xyz',
        params: { activity_key: 'concept:name' },
      });

      const model1 = cache.getModel('key-dfg');
      expect(model1).not.toBeNull();
      expect(model1?.accessCount).toBe(1);

      const model2 = cache.getModel('key-dfg');
      expect(model2?.accessCount).toBe(2);

      const model3 = cache.getModel('key-dfg');
      expect(model3?.accessCount).toBe(3);
    });

    it('should include model metadata', () => {
      const cache = getModelCache();

      const params = { population_size: 20, iterations: 50 };
      cache.cacheDiscovery('key-genetic', {
        handle: 'handle-genetic-abc',
        algorithm: 'genetic_algorithm',
        outputType: 'petrinet',
        durationMs: 2500,
        hash: 'hash-genetic-abc',
        params,
      });

      const model = cache.getModel('key-genetic');
      expect(model?.handle).toBe('handle-genetic-abc');
      expect(model?.algorithm).toBe('genetic_algorithm');
      expect(model?.outputType).toBe('petrinet');
      expect(model?.durationMs).toBe(2500);
      expect(model?.hash).toBe('hash-genetic-abc');
      expect(model?.params).toEqual(params);
      expect(model?.cachedAt).toBeGreaterThan(0);
    });
  });

  describe('model statistics', () => {
    it('should report model cache statistics', () => {
      const cache = getModelCache();

      // Cache multiple models
      cache.cacheDiscovery('key-dfg-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.cacheDiscovery('key-heuristic', {
        handle: 'h2',
        algorithm: 'heuristic_miner',
        outputType: 'dfg',
        durationMs: 300,
        hash: 'hash-2',
        params: {},
      });

      // Access first model twice
      cache.getModel('key-dfg-1');
      cache.getModel('key-dfg-1');

      // Access second model once
      cache.getModel('key-heuristic');

      const stats = cache.modelStats();
      expect(stats.models).toBe(2);
      expect(stats.total_hits).toBe(3); // 2 hits on dfg + 1 on heuristic
      expect(stats.total_misses).toBe(0);
      expect(stats.hit_rate).toBeGreaterThan(0);
    });

    it('should calculate time saved by cache hits', () => {
      const cache = getModelCache();

      cache.cacheDiscovery('key-slow', {
        handle: 'h1',
        algorithm: 'ilp',
        outputType: 'petrinet',
        durationMs: 1000,
        hash: 'hash-1',
        params: {},
      });

      // Access 2 times via getModel: incrementing from 0 to 2
      cache.getModel('key-slow');
      cache.getModel('key-slow');

      const stats = cache.modelStats();
      // Time saved = duration * (accesses - 1) = 1000 * (2 - 1) = 1000ms
      expect(stats.time_saved_ms).toBe(1000);
    });

    it('should track cached algorithms', () => {
      const cache = getModelCache();

      cache.cacheDiscovery('key-dfg-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.cacheDiscovery('key-heuristic', {
        handle: 'h2',
        algorithm: 'heuristic_miner',
        outputType: 'dfg',
        durationMs: 200,
        hash: 'hash-2',
        params: {},
      });

      const algorithms = cache.getCachedAlgorithms().sort();
      expect(algorithms).toContain('dfg');
      expect(algorithms).toContain('heuristic_miner');
    });

    it('should estimate memory usage', () => {
      const cache = getModelCache();

      cache.cacheDiscovery('key-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      const stats = cache.modelStats();
      expect(stats.bytes_used).toBeGreaterThan(0);
      expect(stats.bytes_used).toBeGreaterThanOrEqual(332);
    });
  });

  describe('model cache clearing', () => {
    it('should clear all cached models', () => {
      const cache = getModelCache();

      cache.cacheDiscovery('key-dfg', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.cacheDiscovery('key-heuristic', {
        handle: 'h2',
        algorithm: 'heuristic_miner',
        outputType: 'dfg',
        durationMs: 200,
        hash: 'hash-2',
        params: {},
      });

      let stats = cache.modelStats();
      expect(stats.models).toBe(2);

      cache.clear();

      stats = cache.modelStats();
      expect(stats.models).toBe(0);
      expect(stats.total_hits).toBe(0);
      expect(stats.total_misses).toBe(0);
      expect(stats.time_saved_ms).toBe(0);
    });

    it('should clear models by algorithm', () => {
      const cache = getModelCache();

      cache.cacheDiscovery('key-dfg-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.cacheDiscovery('key-dfg-2', {
        handle: 'h2',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-2',
        params: {},
      });

      cache.cacheDiscovery('key-heuristic', {
        handle: 'h3',
        algorithm: 'heuristic_miner',
        outputType: 'dfg',
        durationMs: 200,
        hash: 'hash-3',
        params: {},
      });

      const removed = cache.invalidateByAlgorithm('dfg');
      expect(removed).toBe(2);

      const stats = cache.modelStats();
      expect(stats.models).toBe(1);

      // DFG models should be gone
      expect(cache.getModel('key-dfg-1')).toBeNull();
      expect(cache.getModel('key-dfg-2')).toBeNull();

      // Heuristic should remain
      expect(cache.getModel('key-heuristic')).not.toBeNull();
    });
  });

  describe('global model cache singleton', () => {
    it('should persist across module access', () => {
      const cache1 = getModelCache();

      cache1.cacheDiscovery('key-test', {
        handle: 'h1',
        algorithm: 'test',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      const cache2 = getModelCache();
      expect(cache2.getModel('key-test')).not.toBeNull();
    });

    it('should reset on resetModelCache', () => {
      const cache1 = getModelCache();

      cache1.cacheDiscovery('key-test', {
        handle: 'h1',
        algorithm: 'test',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      resetModelCache();

      const cache2 = getModelCache();
      expect(cache2.getModel('key-test')).toBeNull();
    });
  });

  describe('model cache hit rate', () => {
    it('should calculate correct hit rate', () => {
      const cache = getModelCache();

      cache.cacheDiscovery('key-test', {
        handle: 'h1',
        algorithm: 'test',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      // 3 hits
      cache.getModel('key-test');
      cache.getModel('key-test');
      cache.getModel('key-test');

      // 2 misses
      cache.getModel('unknown-1');
      cache.getModel('unknown-2');

      const stats = cache.modelStats();
      expect(stats.total_hits).toBe(3);
      expect(stats.total_misses).toBe(2);
      expect(stats.hit_rate).toBe(3 / 5);
      expect(stats.hit_rate).toBeCloseTo(0.6, 2);
    });
  });
});
