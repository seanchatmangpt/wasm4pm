import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ConformanceCache,
  getConformanceCache,
  resetConformanceCache,
  hashLogOrModel,
} from '../conformance-cache.js';

describe('ConformanceCache', () => {
  let cache: ConformanceCache;

  beforeEach(() => {
    cache = new ConformanceCache(100, 1000); // 100 max entries, 1s TTL for testing
    resetConformanceCache();
  });

  afterEach(() => {
    cache.clear();
    resetConformanceCache();
  });

  describe('cacheFitness and getCachedFitness', () => {
    it('should store and retrieve a fitness result', () => {
      const logHash = 'log-hash-123';
      const modelHash = 'model-hash-456';
      const fitness = 0.85;

      cache.cacheFitness(logHash, modelHash, {
        fitness,
        precision: null,
        precision_available: false,
      });

      const cached = cache.getCachedFitness(logHash, modelHash);
      expect(cached).not.toBeNull();
      expect(cached?.fitness).toBe(fitness);
      expect(cached?.precision).toBeNull();
      expect(cached?.precision_available).toBe(false);
    });

    it('should return null on cache miss', () => {
      const result = cache.getCachedFitness('unknown', 'unknown');
      expect(result).toBeNull();
    });

    it('should track hits and misses', () => {
      const logHash = 'log-123';
      const modelHash = 'model-456';

      cache.cacheFitness(logHash, modelHash, {
        fitness: 0.9,
        precision: null,
        precision_available: false,
      });

      const stats1 = cache.stats();
      expect(stats1.hits).toBe(0);
      expect(stats1.misses).toBe(0);

      // Hit
      cache.getCachedFitness(logHash, modelHash);
      const stats2 = cache.stats();
      expect(stats2.hits).toBe(1);
      expect(stats2.misses).toBe(0);

      // Miss
      cache.getCachedFitness('unknown', 'unknown');
      const stats3 = cache.stats();
      expect(stats3.hits).toBe(1);
      expect(stats3.misses).toBe(1);
    });

    it('should return null for expired entries', async () => {
      const logHash = 'log-123';
      const modelHash = 'model-456';
      const shortTtl = 100; // 100ms

      cache.cacheFitness(
        logHash,
        modelHash,
        {
          fitness: 0.85,
          precision: null,
          precision_available: false,
        },
        shortTtl
      );

      // Should be retrievable immediately
      let cached = cache.getCachedFitness(logHash, modelHash);
      expect(cached).not.toBeNull();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      cached = cache.getCachedFitness(logHash, modelHash);
      expect(cached).toBeNull();
    });

    it('should evict oldest entry when capacity exceeded', () => {
      const smallCache = new ConformanceCache(3, 10000); // 3 entries max

      // Add 4 entries
      for (let i = 0; i < 4; i++) {
        smallCache.cacheFitness(`log-${i}`, `model-${i}`, {
          fitness: 0.8 + i * 0.05,
          precision: null,
          precision_available: false,
        });
      }

      const stats = smallCache.stats();
      expect(stats.entries).toBe(3); // Should have evicted oldest

      // First entry should be gone
      const result0 = smallCache.getCachedFitness('log-0', 'model-0');
      expect(result0).toBeNull();

      // Later entries should remain
      const result1 = smallCache.getCachedFitness('log-1', 'model-1');
      expect(result1).not.toBeNull();
    });
  });

  describe('updatePrecision', () => {
    it('should update precision on existing entry', () => {
      const logHash = 'log-123';
      const modelHash = 'model-456';

      cache.cacheFitness(logHash, modelHash, {
        fitness: 0.85,
        precision: null,
        precision_available: false,
      });

      const updated = cache.updatePrecision(logHash, modelHash, 0.88);
      expect(updated).toBe(true);

      const cached = cache.getCachedFitness(logHash, modelHash);
      expect(cached?.precision).toBe(0.88);
      expect(cached?.precision_available).toBe(true);
    });

    it('should return false for non-existent entry', () => {
      const updated = cache.updatePrecision('unknown', 'unknown', 0.9);
      expect(updated).toBe(false);
    });

    it('should return false for expired entry', async () => {
      const logHash = 'log-123';
      const modelHash = 'model-456';

      cache.cacheFitness(
        logHash,
        modelHash,
        {
          fitness: 0.85,
          precision: null,
          precision_available: false,
        },
        100 // 100ms TTL
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      const updated = cache.updatePrecision(logHash, modelHash, 0.88);
      expect(updated).toBe(false);
    });
  });

  describe('stats', () => {
    it('should report cache statistics', () => {
      cache.cacheFitness('log-1', 'model-1', {
        fitness: 0.85,
        precision: null,
        precision_available: false,
      });

      cache.getCachedFitness('log-1', 'model-1'); // Hit
      cache.getCachedFitness('log-x', 'model-x'); // Miss

      const stats = cache.stats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.entries).toBe(1);
      expect(stats.bytes_used).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries and counters', () => {
      cache.cacheFitness('log-1', 'model-1', {
        fitness: 0.85,
        precision: null,
        precision_available: false,
      });

      cache.getCachedFitness('log-1', 'model-1'); // Hit

      cache.clear();

      const stats = cache.stats();
      expect(stats.entries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('purgeExpired', () => {
    it('should remove only expired entries', async () => {
      // Add entry with long TTL
      cache.cacheFitness('log-1', 'model-1', {
        fitness: 0.85,
        precision: null,
        precision_available: false,
      });

      // Add entry with short TTL
      cache.cacheFitness(
        'log-2',
        'model-2',
        {
          fitness: 0.9,
          precision: null,
          precision_available: false,
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
      const cached = cache.getCachedFitness('log-1', 'model-1');
      expect(cached).not.toBeNull();

      // Short-TTL entry should be gone
      const expired = cache.getCachedFitness('log-2', 'model-2');
      expect(expired).toBeNull();
    });
  });

  describe('global singleton', () => {
    it('should return same instance on repeated calls', () => {
      resetConformanceCache();

      const cache1 = getConformanceCache();
      const cache2 = getConformanceCache();

      expect(cache1).toBe(cache2);
    });

    it('should reset to null', () => {
      const cache1 = getConformanceCache();
      cache1.cacheFitness('log-1', 'model-1', {
        fitness: 0.85,
        precision: null,
        precision_available: false,
      });

      resetConformanceCache();

      const cache2 = getConformanceCache();
      // New instance should not have the cached entry
      const result = cache2.getCachedFitness('log-1', 'model-1');
      expect(result).toBeNull();
    });
  });

  describe('hashLogOrModel', () => {
    it('should hash string content', () => {
      const hash1 = hashLogOrModel('content1');
      const hash2 = hashLogOrModel('content1');
      const hash3 = hashLogOrModel('content2');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    });

    it('should hash buffer content', () => {
      const buffer1 = Buffer.from('content1');
      const buffer2 = Buffer.from('content1');
      const hash1 = hashLogOrModel(buffer1);
      const hash2 = hashLogOrModel(buffer2);

      expect(hash1).toBe(hash2);
    });

    it('should produce consistent hashes', () => {
      const content = 'test data';
      const hash1 = hashLogOrModel(content);
      const hash2 = hashLogOrModel(content);

      expect(hash1).toBe(hash2);
    });
  });
});
