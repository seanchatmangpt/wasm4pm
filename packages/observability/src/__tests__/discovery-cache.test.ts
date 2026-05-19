import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DiscoveryCache,
  getDiscoveryCache,
  resetDiscoveryCache,
  generateDiscoveryCacheKey,
} from '../discovery-cache.js';

describe('DiscoveryCache', () => {
  let cache: DiscoveryCache;

  beforeEach(() => {
    cache = new DiscoveryCache(100, 1000); // 100 max entries, 1s TTL for testing
    resetDiscoveryCache();
  });

  afterEach(() => {
    cache.clear();
    resetDiscoveryCache();
  });

  describe('cacheDiscovery and getDiscovery', () => {
    it('should store and retrieve a discovery result', () => {
      const key = 'dfg:log-123:params-456';
      const result = {
        handle: 'handle-123',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 150,
        hash: 'hash-abc123',
        params: { activity_key: 'concept:name' },
      };

      cache.cacheDiscovery(key, result);

      const cached = cache.getDiscovery(key);
      expect(cached).not.toBeNull();
      expect(cached?.handle).toBe(result.handle);
      expect(cached?.algorithm).toBe('dfg');
      expect(cached?.durationMs).toBe(150);
    });

    it('should return null on cache miss', () => {
      const result = cache.getDiscovery('unknown-key');
      expect(result).toBeNull();
    });

    it('should track hits and misses', () => {
      const key = 'dfg:log-123:params-456';
      const result = {
        handle: 'handle-123',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 150,
        hash: 'hash-abc123',
        params: { activity_key: 'concept:name' },
      };

      cache.cacheDiscovery(key, result);

      const stats1 = cache.stats();
      expect(stats1.hits).toBe(0);
      expect(stats1.misses).toBe(0);

      // Hit
      cache.getDiscovery(key);
      const stats2 = cache.stats();
      expect(stats2.hits).toBe(1);
      expect(stats2.misses).toBe(0);

      // Miss
      cache.getDiscovery('unknown');
      const stats3 = cache.stats();
      expect(stats3.hits).toBe(1);
      expect(stats3.misses).toBe(1);
    });

    it('should return null for expired entries', async () => {
      const key = 'dfg:log-123:params-456';
      const shortTtl = 100; // 100ms

      cache.cacheDiscovery(
        key,
        {
          handle: 'handle-123',
          algorithm: 'dfg',
          outputType: 'dfg',
          durationMs: 150,
          hash: 'hash-abc123',
          params: { activity_key: 'concept:name' },
        },
        shortTtl
      );

      // Should be retrievable immediately
      let cached = cache.getDiscovery(key);
      expect(cached).not.toBeNull();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      cached = cache.getDiscovery(key);
      expect(cached).toBeNull();
    });

    it('should evict oldest entry when capacity exceeded', () => {
      const smallCache = new DiscoveryCache(3, 10000); // 3 entries max

      // Add 4 entries
      for (let i = 0; i < 4; i++) {
        smallCache.cacheDiscovery(`key-${i}`, {
          handle: `handle-${i}`,
          algorithm: 'dfg',
          outputType: 'dfg',
          durationMs: 100 + i * 10,
          hash: `hash-${i}`,
          params: { activity_key: 'concept:name' },
        });
      }

      const stats = smallCache.stats();
      expect(stats.entries).toBe(3); // Should have evicted oldest

      // First entry should be gone
      const result0 = smallCache.getDiscovery('key-0');
      expect(result0).toBeNull();

      // Later entries should remain
      const result1 = smallCache.getDiscovery('key-1');
      expect(result1).not.toBeNull();
    });
  });

  describe('invalidateByAlgorithm', () => {
    it('should invalidate all entries for a specific algorithm', () => {
      // Add entries for different algorithms
      cache.cacheDiscovery('key-dfg-1', {
        handle: 'handle-1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.cacheDiscovery('key-dfg-2', {
        handle: 'handle-2',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 120,
        hash: 'hash-2',
        params: {},
      });

      cache.cacheDiscovery('key-hm-1', {
        handle: 'handle-3',
        algorithm: 'heuristic_miner',
        outputType: 'dfg',
        durationMs: 200,
        hash: 'hash-3',
        params: {},
      });

      const stats1 = cache.stats();
      expect(stats1.entries).toBe(3);

      // Invalidate dfg entries
      const removed = cache.invalidateByAlgorithm('dfg');
      expect(removed).toBe(2);

      const stats2 = cache.stats();
      expect(stats2.entries).toBe(1);

      // DFG entries should be gone
      expect(cache.getDiscovery('key-dfg-1')).toBeNull();
      expect(cache.getDiscovery('key-dfg-2')).toBeNull();

      // Other algorithm entries should remain
      expect(cache.getDiscovery('key-hm-1')).not.toBeNull();
    });

    it('should return 0 for non-existent algorithm', () => {
      const removed = cache.invalidateByAlgorithm('unknown_algo');
      expect(removed).toBe(0);
    });
  });

  describe('stats', () => {
    it('should report cache statistics', () => {
      cache.cacheDiscovery('key-1', {
        handle: 'handle-1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.getDiscovery('key-1'); // Hit
      cache.getDiscovery('key-unknown'); // Miss

      const stats = cache.stats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.entries).toBe(1);
      expect(stats.bytes_used).toBeGreaterThan(0);
      expect(stats.avg_age_ms).toBeGreaterThanOrEqual(0);
    });

    it('should calculate hit rate', () => {
      cache.cacheDiscovery('key-1', {
        handle: 'handle-1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      // 2 hits
      cache.getDiscovery('key-1');
      cache.getDiscovery('key-1');

      // 1 miss
      cache.getDiscovery('key-unknown');

      const hitRate = cache.hitRate();
      expect(hitRate).toBe(2 / 3);
    });
  });

  describe('getCachedAlgorithms', () => {
    it('should return all algorithms with cached entries', () => {
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

      const algos = cache.getCachedAlgorithms();
      expect(algos.sort()).toEqual(['dfg', 'heuristic_miner']);
    });

    it('should return empty array when cache is empty', () => {
      const algos = cache.getCachedAlgorithms();
      expect(algos).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear all entries and counters', () => {
      cache.cacheDiscovery('key-1', {
        handle: 'handle-1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      cache.getDiscovery('key-1'); // Hit

      cache.clear();

      const stats = cache.stats();
      expect(stats.entries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);

      const algos = cache.getCachedAlgorithms();
      expect(algos).toEqual([]);
    });
  });

  describe('purgeExpired', () => {
    it('should remove only expired entries', async () => {
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
        100 // 100ms
      );

      const statsBefore = cache.stats();
      expect(statsBefore.entries).toBe(2);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const removed = cache.purgeExpired();
      expect(removed).toBe(1);

      const statsAfter = cache.stats();
      expect(statsAfter.entries).toBe(1);

      // Long-TTL entry should still exist
      const cached = cache.getDiscovery('key-1');
      expect(cached).not.toBeNull();

      // Short-TTL entry should be gone
      const expired = cache.getDiscovery('key-2');
      expect(expired).toBeNull();
    });
  });

  describe('global singleton', () => {
    it('should return same instance on repeated calls', () => {
      resetDiscoveryCache();

      const cache1 = getDiscoveryCache();
      const cache2 = getDiscoveryCache();

      expect(cache1).toBe(cache2);
    });

    it('should reset to null', () => {
      const cache1 = getDiscoveryCache();
      cache1.cacheDiscovery('key-1', {
        handle: 'h1',
        algorithm: 'dfg',
        outputType: 'dfg',
        durationMs: 100,
        hash: 'hash-1',
        params: {},
      });

      resetDiscoveryCache();

      const cache2 = getDiscoveryCache();
      // New instance should not have the cached entry
      const result = cache2.getDiscovery('key-1');
      expect(result).toBeNull();
    });
  });

  describe('generateDiscoveryCacheKey', () => {
    it('should generate consistent cache keys', () => {
      const key1 = generateDiscoveryCacheKey('dfg', 'log-123', { activity_key: 'concept:name' });
      const key2 = generateDiscoveryCacheKey('dfg', 'log-123', { activity_key: 'concept:name' });

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    });

    it('should generate different keys for different inputs', () => {
      const key1 = generateDiscoveryCacheKey('dfg', 'log-123', { activity_key: 'concept:name' });
      const key2 = generateDiscoveryCacheKey('dfg', 'log-456', { activity_key: 'concept:name' });
      const key3 = generateDiscoveryCacheKey('heuristic_miner', 'log-123', {
        activity_key: 'concept:name',
      });

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });

    it('should be insensitive to parameter order', () => {
      const params1 = { z: 3, a: 1, b: 2 };
      const params2 = { a: 1, b: 2, z: 3 };

      const key1 = generateDiscoveryCacheKey('dfg', 'log-123', params1);
      const key2 = generateDiscoveryCacheKey('dfg', 'log-123', params2);

      expect(key1).toBe(key2);
    });
  });
});
