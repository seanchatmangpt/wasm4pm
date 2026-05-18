import { describe, it, expect, beforeEach } from 'vitest';
import { resetDiscoveryCache, getDiscoveryCache } from '@wasm4pm/observability';

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
