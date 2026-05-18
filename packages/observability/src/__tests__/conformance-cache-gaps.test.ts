/**
 * conformance-cache-gaps.test.ts
 *
 * Edge-case and correctness tests for ConformanceCache that are NOT covered
 * by the 16 baseline tests in conformance-cache.test.ts.
 *
 * Gap coverage:
 *  G1 — TTL expiry is evaluated at query time (no race window)
 *  G2 — Eviction is truly LRU, not FIFO (access promotes entry)
 *  G3 — updatePrecision on an expired entry returns false + no silent insert
 *  G4 — updatePrecision when key was never cached returns false (not a silent insert)
 *  G5 — stats().bytes_used scales with entry count (proportional estimate)
 *  G6 — Expired entries are purged before LRU eviction (zombies don't consume live slots)
 *  G7 — Global singleton is isolated between tests when resetConformanceCache() is called
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ConformanceCache,
  getConformanceCache,
  resetConformanceCache,
} from '../conformance-cache.js';

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

function makeFitness(fitness = 0.85) {
  return { fitness, precision: null, precision_available: false } as const;
}

// ---------------------------------------------------------------------------

describe('ConformanceCache — gap tests', () => {
  let cache: ConformanceCache;

  beforeEach(() => {
    // fresh instance per test, 10 entries max, generous TTL unless overridden
    cache = new ConformanceCache(10, 60_000);
    resetConformanceCache();
  });

  afterEach(() => {
    cache.clear();
    resetConformanceCache();
  });

  // -------------------------------------------------------------------------
  // G1 — TTL expiry evaluated at query time
  // -------------------------------------------------------------------------

  describe('G1 — TTL expiry is evaluated at query time', () => {
    it('entry retrievable immediately after insertion', () => {
      cache.cacheFitness('log-g1', 'model-g1', makeFitness(), 200);
      expect(cache.getCachedFitness('log-g1', 'model-g1')).not.toBeNull();
    });

    it('entry returns null after TTL elapses (lazy check, no external purge needed)', async () => {
      cache.cacheFitness('log-g1b', 'model-g1b', makeFitness(), 80);
      // Still alive
      expect(cache.getCachedFitness('log-g1b', 'model-g1b')).not.toBeNull();
      // Wait past TTL
      await new Promise((r) => setTimeout(r, 120));
      // Must return null — expiry is checked at query time
      expect(cache.getCachedFitness('log-g1b', 'model-g1b')).toBeNull();
    });

    it('expired get is counted as a miss', async () => {
      cache.cacheFitness('log-g1c', 'model-g1c', makeFitness(), 60);
      await new Promise((r) => setTimeout(r, 90));
      cache.getCachedFitness('log-g1c', 'model-g1c');
      expect(cache.stats().misses).toBe(1);
      expect(cache.stats().hits).toBe(0);
    });

    it('expired entry is removed from the cache after a failed get', async () => {
      cache.cacheFitness('log-g1d', 'model-g1d', makeFitness(), 60);
      await new Promise((r) => setTimeout(r, 90));
      cache.getCachedFitness('log-g1d', 'model-g1d'); // triggers lazy delete
      expect(cache.stats().entries).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // G2 — LRU eviction (not FIFO)
  // -------------------------------------------------------------------------

  describe('G2 — eviction is truly LRU, not insertion-order FIFO', () => {
    it('accessing A after inserting A and B means B is evicted when C is added (max=2)', () => {
      const lru = new ConformanceCache(2, 60_000);

      lru.cacheFitness('A', 'A', makeFitness(0.80)); // insert A
      lru.cacheFitness('B', 'B', makeFitness(0.90)); // insert B

      // Access A — must promote A to MRU position
      const a = lru.getCachedFitness('A', 'A');
      expect(a).not.toBeNull(); // sanity

      // Insert C — cache is full; LRU (B) should be evicted, not A
      lru.cacheFitness('C', 'C', makeFitness(0.95));

      // A survived (most recently accessed)
      expect(lru.getCachedFitness('A', 'A')).not.toBeNull();
      // C survived (just inserted)
      expect(lru.getCachedFitness('C', 'C')).not.toBeNull();
      // B was evicted (least recently used)
      expect(lru.getCachedFitness('B', 'B')).toBeNull();
    });

    it('insertion without access evicts the oldest-inserted entry (degenerate FIFO case is correct)', () => {
      const lru = new ConformanceCache(2, 60_000);
      lru.cacheFitness('X', 'X', makeFitness(0.80));
      lru.cacheFitness('Y', 'Y', makeFitness(0.85));
      // No accesses — insert Z should evict X (oldest, also LRU)
      lru.cacheFitness('Z', 'Z', makeFitness(0.90));

      expect(lru.getCachedFitness('X', 'X')).toBeNull();  // evicted
      expect(lru.getCachedFitness('Y', 'Y')).not.toBeNull();
      expect(lru.getCachedFitness('Z', 'Z')).not.toBeNull();
    });

    it('multiple accesses to the same entry keep it as MRU across several inserts', () => {
      const lru = new ConformanceCache(3, 60_000);
      lru.cacheFitness('P', 'P', makeFitness(0.80));
      lru.cacheFitness('Q', 'Q', makeFitness(0.85));
      lru.cacheFitness('R', 'R', makeFitness(0.88));

      // Repeatedly access P — it should survive despite being oldest inserted
      lru.getCachedFitness('P', 'P');
      lru.getCachedFitness('P', 'P');

      // Insert S (evicts LRU among Q, R — Q is older and not accessed)
      lru.cacheFitness('S', 'S', makeFitness(0.91));

      expect(lru.getCachedFitness('P', 'P')).not.toBeNull(); // protected by access
      expect(lru.getCachedFitness('Q', 'Q')).toBeNull();     // LRU, evicted
      expect(lru.getCachedFitness('R', 'R')).not.toBeNull();
      expect(lru.getCachedFitness('S', 'S')).not.toBeNull();
    });

    it('entry count never exceeds maxEntries after LRU eviction', () => {
      const lru = new ConformanceCache(5, 60_000);
      for (let i = 0; i < 20; i++) {
        lru.cacheFitness(`log-${i}`, `model-${i}`, makeFitness());
      }
      expect(lru.stats().entries).toBeLessThanOrEqual(5);
    });
  });

  // -------------------------------------------------------------------------
  // G3 — updatePrecision on expired entry
  // -------------------------------------------------------------------------

  describe('G3 — updatePrecision on expired entry', () => {
    it('returns false when entry has expired', async () => {
      cache.cacheFitness('log-g3', 'model-g3', makeFitness(), 60);
      await new Promise((r) => setTimeout(r, 90));
      const updated = cache.updatePrecision('log-g3', 'model-g3', 0.9);
      expect(updated).toBe(false);
    });

    it('does not re-insert an expired entry', async () => {
      cache.cacheFitness('log-g3b', 'model-g3b', makeFitness(), 60);
      await new Promise((r) => setTimeout(r, 90));
      cache.updatePrecision('log-g3b', 'model-g3b', 0.9);
      // Entry must not be silently re-inserted by updatePrecision
      expect(cache.getCachedFitness('log-g3b', 'model-g3b')).toBeNull();
      expect(cache.stats().entries).toBe(0);
    });

    it('valid entry remains valid after successful precision update', () => {
      cache.cacheFitness('log-g3c', 'model-g3c', makeFitness(), 60_000);
      const ok = cache.updatePrecision('log-g3c', 'model-g3c', 0.77);
      expect(ok).toBe(true);
      const entry = cache.getCachedFitness('log-g3c', 'model-g3c');
      expect(entry?.precision).toBe(0.77);
      expect(entry?.precision_available).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // G4 — updatePrecision on a key that was never cached
  // -------------------------------------------------------------------------

  describe('G4 — updatePrecision on key that was never cached', () => {
    it('returns false for a key that was never inserted', () => {
      const result = cache.updatePrecision('never-log', 'never-model', 0.9);
      expect(result).toBe(false);
    });

    it('does not create a new entry for a key that was never cached', () => {
      cache.updatePrecision('ghost-log', 'ghost-model', 0.88);
      expect(cache.stats().entries).toBe(0);
      // getCachedFitness must also return null
      expect(cache.getCachedFitness('ghost-log', 'ghost-model')).toBeNull();
    });

    it('does not increment hit or miss counters when key is absent', () => {
      cache.updatePrecision('absent-log', 'absent-model', 0.5);
      const s = cache.stats();
      expect(s.hits).toBe(0);
      expect(s.misses).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // G5 — stats().bytes_used scales with entry count
  // -------------------------------------------------------------------------

  describe('G5 — bytes_used is proportional to entry count', () => {
    it('bytes_used is 0 when cache is empty', () => {
      expect(cache.stats().bytes_used).toBe(0);
    });

    it('bytes_used increases when entries are added', () => {
      cache.cacheFitness('log-a', 'model-a', makeFitness());
      const after1 = cache.stats().bytes_used;
      expect(after1).toBeGreaterThan(0);

      cache.cacheFitness('log-b', 'model-b', makeFitness());
      const after2 = cache.stats().bytes_used;
      expect(after2).toBeGreaterThan(after1);
    });

    it('bytes_used is strictly proportional: n entries = n * bytes_per_entry', () => {
      cache.cacheFitness('log-s1', 'model-s1', makeFitness());
      const oneEntry = cache.stats().bytes_used;

      cache.cacheFitness('log-s2', 'model-s2', makeFitness());
      cache.cacheFitness('log-s3', 'model-s3', makeFitness());
      const threeEntries = cache.stats().bytes_used;

      expect(threeEntries).toBe(oneEntry * 3);
    });

    it('bytes_used returns to 0 after clear()', () => {
      cache.cacheFitness('log-c', 'model-c', makeFitness());
      cache.clear();
      expect(cache.stats().bytes_used).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // G6 — Expired entries are purged before LRU eviction
  // -------------------------------------------------------------------------

  describe('G6 — expired zombie entries do not consume live slots', () => {
    it('inserting at capacity when all existing entries are expired: no live entry is evicted', async () => {
      // max=2: insert A (short TTL) and B (short TTL)
      const tightCache = new ConformanceCache(2, 60_000);
      tightCache.cacheFitness('A', 'A', makeFitness(0.80), 60); // will expire
      tightCache.cacheFitness('B', 'B', makeFitness(0.85), 60); // will expire

      await new Promise((r) => setTimeout(r, 90)); // both expired

      // Insert C — should reclaim the two expired slots, not evict any live entry
      tightCache.cacheFitness('C', 'C', makeFitness(0.90), 60_000);

      // C must be present
      expect(tightCache.getCachedFitness('C', 'C')).not.toBeNull();
      // A and B are gone (expired)
      expect(tightCache.getCachedFitness('A', 'A')).toBeNull();
      expect(tightCache.getCachedFitness('B', 'B')).toBeNull();
    });

    it('zombie entries do not force eviction of a live entry inserted earlier', async () => {
      // max=2: insert LIVE (long TTL), then ZOMBIE (short TTL)
      const tightCache = new ConformanceCache(2, 60_000);
      tightCache.cacheFitness('live', 'live', makeFitness(0.90), 60_000); // long-lived
      tightCache.cacheFitness('zombie', 'zombie', makeFitness(0.70), 60);  // will expire

      await new Promise((r) => setTimeout(r, 90)); // zombie expired

      // Insert NEW — cache is at capacity (size=2), but zombie is dead.
      // Zombie should be purged first; LIVE must not be evicted.
      tightCache.cacheFitness('new', 'new', makeFitness(0.88), 60_000);

      expect(tightCache.getCachedFitness('live', 'live')).not.toBeNull();  // must survive
      expect(tightCache.getCachedFitness('new', 'new')).not.toBeNull();    // must be present
      expect(tightCache.getCachedFitness('zombie', 'zombie')).toBeNull();  // expired
    });

    it('explicit purgeExpired() removes all expired entries and returns count', async () => {
      cache.cacheFitness('log-p1', 'model-p1', makeFitness(), 60);
      cache.cacheFitness('log-p2', 'model-p2', makeFitness(), 60);
      cache.cacheFitness('log-p3', 'model-p3', makeFitness(), 60_000); // stays alive

      await new Promise((r) => setTimeout(r, 90));

      const removed = cache.purgeExpired();
      expect(removed).toBe(2);
      expect(cache.stats().entries).toBe(1);
      expect(cache.getCachedFitness('log-p3', 'model-p3')).not.toBeNull();
    });

    it('purgeExpired() returns 0 when nothing has expired', () => {
      cache.cacheFitness('log-q1', 'model-q1', makeFitness(), 60_000);
      expect(cache.purgeExpired()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // G7 — Global singleton isolation
  // -------------------------------------------------------------------------

  describe('G7 — global singleton isolation across tests', () => {
    it('resetConformanceCache() creates a fresh instance on next getConformanceCache()', () => {
      const c1 = getConformanceCache();
      c1.cacheFitness('log-global', 'model-global', makeFitness());
      resetConformanceCache();

      const c2 = getConformanceCache();
      // c2 is a new instance — must not see data written to c1
      expect(c2.getCachedFitness('log-global', 'model-global')).toBeNull();
      expect(c2.stats().entries).toBe(0);
    });

    it('two calls to getConformanceCache() without reset share the same instance', () => {
      const c1 = getConformanceCache();
      c1.cacheFitness('shared-log', 'shared-model', makeFitness());

      const c2 = getConformanceCache();
      // Same instance — data written via c1 is readable via c2
      expect(c2.getCachedFitness('shared-log', 'shared-model')).not.toBeNull();
      expect(c1).toBe(c2);
    });

    it('reset followed by two gets returns the same (new) instance', () => {
      resetConformanceCache();
      const c1 = getConformanceCache();
      const c2 = getConformanceCache();
      expect(c1).toBe(c2);
    });

    it('local ConformanceCache instances are always isolated from the singleton', () => {
      // A fresh `new ConformanceCache()` must not share state with the global
      const localCache = new ConformanceCache(10, 60_000);
      localCache.cacheFitness('local-log', 'local-model', makeFitness());

      const global = getConformanceCache();
      expect(global.getCachedFitness('local-log', 'local-model')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Cross-gap: LRU + TTL interaction
  // -------------------------------------------------------------------------

  describe('cross-gap — LRU promotion does not reset TTL', () => {
    it('accessing an entry does not extend its TTL', async () => {
      const lru = new ConformanceCache(5, 60_000);
      lru.cacheFitness('ttl-log', 'ttl-model', makeFitness(), 80);

      // Access it (promotes to MRU) — TTL must not be extended
      await new Promise((r) => setTimeout(r, 40));
      expect(lru.getCachedFitness('ttl-log', 'ttl-model')).not.toBeNull(); // still alive

      await new Promise((r) => setTimeout(r, 60)); // now past original 80ms TTL
      expect(lru.getCachedFitness('ttl-log', 'ttl-model')).toBeNull(); // must have expired
    });
  });
});
