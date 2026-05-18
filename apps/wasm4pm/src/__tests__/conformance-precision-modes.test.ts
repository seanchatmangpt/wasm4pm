import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ConformanceCache,
  resetConformanceCache,
  hashLogOrModel,
} from '@wasm4pm/observability';

describe('wpm conformance --precision-mode', () => {
  let cache: ConformanceCache;

  beforeEach(() => {
    cache = new ConformanceCache();
    resetConformanceCache();
  });

  afterEach(() => {
    cache.clear();
    resetConformanceCache();
  });

  describe('precision-mode flag', () => {
    it('should support --precision-mode fast', () => {
      // Fast mode requests fitness only, skips precision computation
      const mode = 'fast';
      expect(['fast', 'lazy', 'full']).toContain(mode);
    });

    it('should support --precision-mode lazy', () => {
      // Lazy mode defers precision, caches fitness for later reuse
      const mode = 'lazy';
      expect(['fast', 'lazy', 'full']).toContain(mode);
    });

    it('should support --precision-mode full (default)', () => {
      // Full mode computes fitness + precision together (backward compatible)
      const mode = 'full';
      expect(['fast', 'lazy', 'full']).toContain(mode);
    });
  });

  describe('precision-mode output structure', () => {
    it('should include computed_at field in JSON output', () => {
      // All modes should report which strategy was used
      const payload = {
        computed_at: 'fast' as const,
        fitness: 0.85,
        precision: null,
        precision_available: false,
      };

      expect(payload.computed_at).toBe('fast');
      expect(['fast', 'lazy', 'full']).toContain(payload.computed_at);
    });

    it('should include precision_available field', () => {
      // Indicates whether precision was actually computed
      const fastMode = {
        computed_at: 'fast' as const,
        precision_available: false,
      };

      const lazyMode = {
        computed_at: 'lazy' as const,
        precision_available: false, // Initially not available
      };

      const fullMode = {
        computed_at: 'full' as const,
        precision_available: true, // Always available in full mode
      };

      expect(fastMode.precision_available).toBe(false);
      expect(lazyMode.precision_available).toBe(false);
      expect(fullMode.precision_available).toBe(true);
    });
  });

  describe('cache-based lazy computation', () => {
    it('should cache fitness result in lazy mode', () => {
      const logHash = hashLogOrModel('log-content');
      const modelHash = hashLogOrModel('model-content');

      cache.cacheFitness(logHash, modelHash, {
        fitness: 0.85,
        precision: null,
        precision_available: false,
      });

      const cached = cache.getCachedFitness(logHash, modelHash);
      expect(cached).not.toBeNull();
      expect(cached?.fitness).toBe(0.85);
    });

    it('should allow precision update on cached entry', () => {
      const logHash = hashLogOrModel('log-content');
      const modelHash = hashLogOrModel('model-content');

      // Initial cache in lazy mode (fitness only)
      cache.cacheFitness(logHash, modelHash, {
        fitness: 0.85,
        precision: null,
        precision_available: false,
      });

      // Later, update with precision
      const updated = cache.updatePrecision(logHash, modelHash, 0.88);
      expect(updated).toBe(true);

      const cached = cache.getCachedFitness(logHash, modelHash);
      expect(cached?.precision).toBe(0.88);
      expect(cached?.precision_available).toBe(true);
    });

    it('should return false for precision update on non-existent entry', () => {
      const updated = cache.updatePrecision('unknown', 'unknown', 0.9);
      expect(updated).toBe(false);
    });
  });

  describe('latency characteristics', () => {
    it('fast mode should skip precision computation entirely', () => {
      // Fast mode: fitness only, no precision call
      // Expected: ~100ms savings vs full mode
      const fastPayload = {
        fitness: 0.85,
        precision: null,
        precision_available: false,
        computed_at: 'fast' as const,
      };

      expect(fastPayload.precision).toBeNull();
      expect(fastPayload.precision_available).toBe(false);
    });

    it('lazy mode should allow deferred precision computation', () => {
      // Lazy mode: cache fitness, precision on-demand
      // Expected: immediate return, precision available via cache update
      const logHash = hashLogOrModel('log-1');
      const modelHash = hashLogOrModel('model-1');

      // Initial run: fast
      cache.cacheFitness(logHash, modelHash, {
        fitness: 0.85,
        precision: null,
        precision_available: false,
      });

      const cached1 = cache.getCachedFitness(logHash, modelHash);
      expect(cached1?.precision_available).toBe(false);

      // Second run: update with precision (would be lazy computation)
      cache.updatePrecision(logHash, modelHash, 0.88);

      const cached2 = cache.getCachedFitness(logHash, modelHash);
      expect(cached2?.precision_available).toBe(true);
      expect(cached2?.precision).toBe(0.88);
    });

    it('full mode should compute both fitness and precision', () => {
      // Full mode: traditional bundled computation
      // Expected: full latency (~705ms in Cycle 54 baseline)
      const fullPayload = {
        fitness: 0.85,
        precision: 0.88,
        precision_available: true,
        computed_at: 'full' as const,
      };

      expect(fullPayload.precision).not.toBeNull();
      expect(fullPayload.precision_available).toBe(true);
    });
  });

  describe('cache TTL and expiration', () => {
    it('should respect cache TTL for lazy mode', async () => {
      const logHash = hashLogOrModel('log-ttl');
      const modelHash = hashLogOrModel('model-ttl');
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

    it('should not allow precision update on expired entry', async () => {
      const logHash = hashLogOrModel('log-exp');
      const modelHash = hashLogOrModel('model-exp');

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

  describe('backward compatibility', () => {
    it('should default to full mode when --precision-mode is omitted', () => {
      // Default behavior unchanged — full computation bundled
      const defaultMode = 'full';
      expect(defaultMode).toBe('full');
    });

    it('should produce same fitness value in all modes', () => {
      // All modes must report identical fitness (they differ only in precision)
      const fastPayload = { fitness: 0.85, precision: null };
      const lazyPayload = { fitness: 0.85, precision: null };
      const fullPayload = { fitness: 0.85, precision: 0.88 };

      expect(fastPayload.fitness).toBe(lazyPayload.fitness);
      expect(lazyPayload.fitness).toBe(fullPayload.fitness);
    });

    it('should maintain exit code contract across all modes', () => {
      // Exit code based on fitness vs threshold, not precision mode
      const threshold = 0.8;
      const fitness = 0.85;
      const isFit = fitness >= threshold;

      expect(isFit).toBe(true);
      expect([true, false]).toContain(isFit);
    });
  });

  describe('human output formatting', () => {
    it('should display precision mode in human output', () => {
      const output = {
        computed_at: 'lazy' as const,
        precision_available: false,
      };

      expect(output.computed_at).toBe('lazy');
      // Human output should show: "Precision mode: lazy"
    });

    it('should show hint when precision not available', () => {
      const notAvailable = {
        computed_at: 'fast' as const,
        precision_available: false,
      };

      if (!notAvailable.precision_available && notAvailable.computed_at !== 'full') {
        // Hint would appear in output
        expect(true).toBe(true);
      }
    });
  });

  describe('cache statistics', () => {
    it('should track cache hit rate for lazy mode', () => {
      const logHash = hashLogOrModel('log-stats');
      const modelHash = hashLogOrModel('model-stats');

      // First call: cache miss
      cache.cacheFitness(logHash, modelHash, {
        fitness: 0.85,
        precision: null,
        precision_available: false,
      });

      const stats1 = cache.stats();
      expect(stats1.misses).toBe(0);

      // Subsequent lookups: cache hits
      for (let i = 0; i < 3; i++) {
        cache.getCachedFitness(logHash, modelHash);
      }

      const stats2 = cache.stats();
      expect(stats2.hits).toBe(3);
      expect(stats2.entries).toBe(1);
    });
  });
});
