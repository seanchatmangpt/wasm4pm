/**
 * Gap-closing tests for packages/observability.
 *
 * Three real gaps closed in this file:
 *
 * GAP-1: DiscoveryCache LRU eviction algorithm-index corruption
 *   After `cacheDiscovery` evicts the oldest entry to respect maxEntries, the
 *   algorithm index still contains a stale reference to the evicted key.
 *   The bug is that `this.cache.get(oldestKey)` is called AFTER
 *   `this.cache.delete(oldestKey)`, so the cleanup code is dead — it always
 *   receives `undefined` and never removes the stale index entry.
 *   Result: `invalidateByAlgorithm()` returns an inflated count, and
 *   `getCachedAlgorithms()` lists algorithms that have no live entries.
 *
 * GAP-2: ResultDeduplicator TTL expiry does not evict from index
 *   `getExistingResult()` returns null for expired entries but never removes
 *   them from `this.index`. So `stats().total_entries` stays inflated, and
 *   `isDuplicate()` still returns true after TTL expiry.
 *
 * GAP-3: New Instrumentation factory spans missing attribute-level tests
 *   `createConformanceCacheHitEvent`, `createConformanceCacheMissEvent`,
 *   `createDedupHitEvent`, and `createFeedbackCapturedEvent` are only tested
 *   for span name. No test verifies their required attributes or status.code.
 *
 * Oracle ranks:
 *   Rank 1 — Mathematical: properties that hold for ANY correct implementation
 *   Rank 2 — Domain contract: design-decided properties (advertised behaviour)
 *   Rank 3 — Metamorphic: input perturbation → predictable output relationship
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { tmpdir } from 'os';
import {
  DiscoveryCache,
  generateDiscoveryCacheKey,
} from '../discovery-cache.js';
import {
  ResultDeduplicator,
} from '../result-dedup.js';
import { Instrumentation } from '../instrumentation.js';
import type { OtelEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_TMP = path.join(tmpdir(), 'wasm4pm-gaps-test');

function ensureTestDir(): void {
  if (!fs.existsSync(TEST_TMP)) {
    fs.mkdirSync(TEST_TMP, { recursive: true });
  }
}

function cleanupTestDir(): void {
  if (fs.existsSync(TEST_TMP)) {
    fs.rmSync(TEST_TMP, { recursive: true, force: true });
  }
}

function createTestLog(content: string): string {
  ensureTestDir();
  const fileName = `gap-test-${Date.now()}-${Math.random().toString(36).slice(2)}.xes`;
  const filePath = path.join(TEST_TMP, fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function makeDiscoveryEntry(algorithm: string, suffix = '') {
  return {
    handle: `handle-${suffix || algorithm}`,
    algorithm,
    outputType: 'dfg',
    durationMs: 100,
    hash: `hash-${suffix || algorithm}`,
    params: { activity_key: 'concept:name' },
  };
}

// ---------------------------------------------------------------------------
// GAP-1: DiscoveryCache LRU eviction — algorithm index corruption
// ---------------------------------------------------------------------------

describe('GAP-1 (Rank 2 — domain contract): DiscoveryCache LRU eviction cleans algorithm index', () => {
  let cache: DiscoveryCache;

  beforeEach(() => {
    cache = new DiscoveryCache(3, 24 * 60 * 60 * 1000); // maxEntries=3
  });

  it('algorithm index does not contain stale reference after LRU eviction', () => {
    // Fill to capacity with a single algorithm
    cache.cacheDiscovery('key-0', makeDiscoveryEntry('dfg', '0'));
    cache.cacheDiscovery('key-1', makeDiscoveryEntry('dfg', '1'));
    cache.cacheDiscovery('key-2', makeDiscoveryEntry('dfg', '2'));

    // This insert causes 'key-0' to be evicted (LRU = insertion order)
    cache.cacheDiscovery('key-3', makeDiscoveryEntry('dfg', '3'));

    // After correct eviction: 3 entries remain (key-1, key-2, key-3)
    expect(cache.stats().entries).toBe(3);

    // invalidateByAlgorithm('dfg') must return exactly 3 (not 4)
    // because key-0 was evicted. If the algorithm index is stale,
    // it still has 4 entries and returns 4 — that is the bug.
    const removed = cache.invalidateByAlgorithm('dfg');
    expect(removed).toBe(3);
  });

  it('getCachedAlgorithms() lists only algorithms with live entries after eviction', () => {
    // Add 3 entries of different algorithms to saturate the cache
    cache.cacheDiscovery('key-a', makeDiscoveryEntry('alpha_plus_plus', 'a'));
    cache.cacheDiscovery('key-b', makeDiscoveryEntry('heuristic_miner', 'b'));
    cache.cacheDiscovery('key-c', makeDiscoveryEntry('inductive_miner', 'c'));

    // Evict 'key-a' (alpha_plus_plus) with a new dfg entry
    cache.cacheDiscovery('key-d', makeDiscoveryEntry('dfg', 'd'));

    // alpha_plus_plus has no live entries — must NOT appear in getCachedAlgorithms()
    const algos = cache.getCachedAlgorithms();
    expect(algos).not.toContain('alpha_plus_plus');
    // dfg, heuristic_miner, inductive_miner must remain
    expect(algos).toContain('dfg');
    expect(algos).toContain('heuristic_miner');
    expect(algos).toContain('inductive_miner');
  });

  it('invalidateByAlgorithm count after eviction matches number of live entries only', () => {
    // Add 2 dfg entries and 1 heuristic entry
    cache.cacheDiscovery('dfg-1', makeDiscoveryEntry('dfg', '1'));
    cache.cacheDiscovery('dfg-2', makeDiscoveryEntry('dfg', '2'));
    cache.cacheDiscovery('hm-1', makeDiscoveryEntry('heuristic_miner', 'hm1'));

    // Evict dfg-1 by inserting a new entry
    cache.cacheDiscovery('new-1', makeDiscoveryEntry('dfg', 'new1'));

    // Now dfg has: dfg-2, new-1 (dfg-1 was evicted)
    const removed = cache.invalidateByAlgorithm('dfg');
    // Should be exactly 2, not 3
    expect(removed).toBe(2);
  });

  it('Rank 1 — after N evictions, stats().entries never exceeds maxEntries', () => {
    const small = new DiscoveryCache(2, 24 * 60 * 60 * 1000);
    for (let i = 0; i < 10; i++) {
      small.cacheDiscovery(`key-${i}`, makeDiscoveryEntry('dfg', String(i)));
    }
    // maxEntries=2, 10 inserts — should be exactly 2
    expect(small.stats().entries).toBe(2);
  });

  it('Rank 3 — generateDiscoveryCacheKey is stable regardless of param insertion order', () => {
    // Two separate calls with the same logical params in different insertion order
    const k1 = generateDiscoveryCacheKey('dfg', 'handle-abc', { z: 99, a: 1 });
    const k2 = generateDiscoveryCacheKey('dfg', 'handle-abc', { a: 1, z: 99 });
    expect(k1).toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// GAP-2: ResultDeduplicator TTL expiry does not evict from index
// ---------------------------------------------------------------------------

describe('GAP-2 (Rank 2 — domain contract): ResultDeduplicator TTL expiry evicts stale entries', () => {
  let dedup: ResultDeduplicator;

  beforeEach(() => {
    ensureTestDir();
    dedup = new ResultDeduplicator(
      path.join(TEST_TMP, `dedup-gap-${Date.now()}.jsonl`)
    );
  });

  afterEach(() => {
    dedup.clearMemory();
    cleanupTestDir();
  });

  it('stats().total_entries drops after TTL expiry + purgeExpired()', async () => {
    const logPath = createTestLog('ttl-content');
    await dedup.recordResult(logPath, 'dfg', { nodes: 5 }, undefined, 50); // 50ms TTL

    expect(dedup.stats().total_entries).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 80));

    // purgeExpired removes the stale entry from the index
    const removed = dedup.purgeExpired();
    expect(removed).toBe(1);
    expect(dedup.stats().total_entries).toBe(0);
  });

  it('isDuplicate returns false for expired entries after purgeExpired()', async () => {
    const content = 'ttl-dup-check';
    const logPath = createTestLog(content);

    await dedup.recordResult(logPath, 'dfg', { nodes: 5 }, undefined, 50);

    // Before expiry — should be a duplicate
    expect(await dedup.isDuplicate(logPath)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 80));
    dedup.purgeExpired();

    // After expiry + purge — must NOT be a duplicate
    expect(await dedup.isDuplicate(logPath)).toBe(false);
  });

  it('getExistingResult returns null for expired entry (TTL gate)', async () => {
    const logPath = createTestLog('ttl-get-result');
    await dedup.recordResult(logPath, 'dfg', { nodes: 10 }, undefined, 50);

    await new Promise((resolve) => setTimeout(resolve, 80));

    const result = await dedup.getExistingResult(logPath, 'dfg');
    expect(result).toBeNull();
  });

  it('deduplicatedCount does NOT increment for expired entries', async () => {
    const logPath = createTestLog('ttl-no-increment');
    await dedup.recordResult(logPath, 'dfg', { nodes: 7 }, undefined, 50);

    await new Promise((resolve) => setTimeout(resolve, 80));

    const before = dedup.stats().deduplicated_count;
    await dedup.getExistingResult(logPath, 'dfg');
    const after = dedup.stats().deduplicated_count;

    expect(after).toBe(before); // count must not change for expired entry
  });

  it('window of exactly 1 item — stats total_entries is 1 after single record', async () => {
    const logPath = createTestLog('single-item');
    await dedup.recordResult(logPath, 'dfg', { nodes: 1 });

    expect(dedup.stats().total_entries).toBe(1);
  });

  it('window=0 TTL — entry is immediately expired', async () => {
    const logPath = createTestLog('zero-ttl');
    await dedup.recordResult(logPath, 'dfg', { nodes: 1 }, undefined, 0); // 0ms TTL

    // A zero-ms TTL entry: age=0 == ttl_ms=0 satisfies `age <= ttl_ms` —
    // but any slight delay (> 0ms) means age > 0. The test checks behaviour
    // immediately — the entry may or may not be found. What MUST hold is that
    // after a 1ms delay the entry is gone.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await dedup.getExistingResult(logPath, 'dfg');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GAP-3: New Instrumentation factory spans — attribute-level contracts
// ---------------------------------------------------------------------------

describe('GAP-3 (Rank 2 — domain contract): new cache/feedback/dedup span attributes', () => {
  // ── createConformanceCacheHitEvent ────────────────────────────────────────

  describe('createConformanceCacheHitEvent', () => {
    it('status.code is "OK" (never omitted)', () => {
      const event = Instrumentation.createConformanceCacheHitEvent(
        'log-abc', 'model-xyz', true, 300
      );
      expect(event.status.code).toBe('OK');
    });

    it('carries cache.log_hash with the supplied log hash', () => {
      const event = Instrumentation.createConformanceCacheHitEvent(
        'my-log-hash', 'my-model-hash', false, 500
      );
      expect(event.attributes['cache.log_hash']).toBe('my-log-hash');
    });

    it('carries cache.model_hash with the supplied model hash', () => {
      const event = Instrumentation.createConformanceCacheHitEvent(
        'lhash', 'mhash', false, 0
      );
      expect(event.attributes['cache.model_hash']).toBe('mhash');
    });

    it('carries cache.precision_available matching the supplied boolean', () => {
      const eventTrue = Instrumentation.createConformanceCacheHitEvent(
        'lh', 'mh', true, 100
      );
      const eventFalse = Instrumentation.createConformanceCacheHitEvent(
        'lh', 'mh', false, 100
      );
      expect(eventTrue.attributes['cache.precision_available']).toBe(true);
      expect(eventFalse.attributes['cache.precision_available']).toBe(false);
    });

    it('carries cache.age_ms matching the supplied ageMs value', () => {
      const event = Instrumentation.createConformanceCacheHitEvent(
        'lh', 'mh', true, 12345
      );
      expect(event.attributes['cache.age_ms']).toBe(12345);
    });

    it('carries service.name === "wasm4pm"', () => {
      const event = Instrumentation.createConformanceCacheHitEvent('lh', 'mh', true, 1);
      expect(event.attributes['service.name']).toBe('wasm4pm');
    });

    it('Rank 3 — ageMs=0 is valid (freshly cached entry)', () => {
      expect(() =>
        Instrumentation.createConformanceCacheHitEvent('lh', 'mh', false, 0)
      ).not.toThrow();
    });
  });

  // ── createConformanceCacheMissEvent ───────────────────────────────────────

  describe('createConformanceCacheMissEvent', () => {
    it('status.code is "OK"', () => {
      const event = Instrumentation.createConformanceCacheMissEvent(
        'log-a', 'model-b', 'not_found'
      );
      expect(event.status.code).toBe('OK');
    });

    it('carries cache.miss_reason for not_found', () => {
      const event = Instrumentation.createConformanceCacheMissEvent(
        'lh', 'mh', 'not_found'
      );
      expect(event.attributes['cache.miss_reason']).toBe('not_found');
    });

    it('carries cache.miss_reason for expired', () => {
      const event = Instrumentation.createConformanceCacheMissEvent(
        'lh', 'mh', 'expired'
      );
      expect(event.attributes['cache.miss_reason']).toBe('expired');
    });

    it('carries cache.log_hash and cache.model_hash', () => {
      const event = Instrumentation.createConformanceCacheMissEvent(
        'log-x', 'model-y', 'not_found'
      );
      expect(event.attributes['cache.log_hash']).toBe('log-x');
      expect(event.attributes['cache.model_hash']).toBe('model-y');
    });

    it('carries service.name === "wasm4pm"', () => {
      const event = Instrumentation.createConformanceCacheMissEvent('lh', 'mh', 'expired');
      expect(event.attributes['service.name']).toBe('wasm4pm');
    });

    it('Rank 1 — miss reason is constrained to "not_found" | "expired"', () => {
      // TypeScript enforces this at compile time; runtime value must be one of them
      const event = Instrumentation.createConformanceCacheMissEvent('lh', 'mh', 'not_found');
      const reason = event.attributes['cache.miss_reason'];
      expect(['not_found', 'expired']).toContain(reason);
    });
  });

  // ── createDedupHitEvent ───────────────────────────────────────────────────

  describe('createDedupHitEvent', () => {
    it('status.code is "OK"', () => {
      const event = Instrumentation.createDedupHitEvent('/logs/run.xes', 'dfg', 800);
      expect(event.status.code).toBe('OK');
    });

    it('carries dedup.log_path with the supplied path', () => {
      const event = Instrumentation.createDedupHitEvent('/data/log.xes', 'dfg', 200);
      expect(event.attributes['dedup.log_path']).toBe('/data/log.xes');
    });

    it('carries dedup.algorithm with the supplied algorithm name', () => {
      const event = Instrumentation.createDedupHitEvent('/data/log.xes', 'heuristic_miner', 200);
      expect(event.attributes['dedup.algorithm']).toBe('heuristic_miner');
    });

    it('carries dedup.age_ms with the supplied age', () => {
      const event = Instrumentation.createDedupHitEvent('/data/log.xes', 'dfg', 42000);
      expect(event.attributes['dedup.age_ms']).toBe(42000);
    });

    it('carries service.name === "wasm4pm"', () => {
      const event = Instrumentation.createDedupHitEvent('/data/log.xes', 'dfg', 0);
      expect(event.attributes['service.name']).toBe('wasm4pm');
    });

    it('Rank 3 — two calls with different algorithms produce different attributes', () => {
      const e1 = Instrumentation.createDedupHitEvent('/data/log.xes', 'dfg', 100);
      const e2 = Instrumentation.createDedupHitEvent('/data/log.xes', 'ilp', 100);
      expect(e1.attributes['dedup.algorithm']).not.toBe(e2.attributes['dedup.algorithm']);
    });
  });

  // ── createFeedbackCapturedEvent ───────────────────────────────────────────

  describe('createFeedbackCapturedEvent', () => {
    it('status.code is "OK"', () => {
      const event = Instrumentation.createFeedbackCapturedEvent('dfg', '100-1K', 0.92, 145);
      expect(event.status.code).toBe('OK');
    });

    it('carries feedback.algorithm matching the supplied algorithm', () => {
      const event = Instrumentation.createFeedbackCapturedEvent('ilp', '1K-10K', 0.88, 200);
      expect(event.attributes['feedback.algorithm']).toBe('ilp');
    });

    it('carries feedback.log_size_bucket matching the supplied bucket', () => {
      const event = Instrumentation.createFeedbackCapturedEvent('dfg', '10K+', 0.91, 50);
      expect(event.attributes['feedback.log_size_bucket']).toBe('10K+');
    });

    it('carries feedback.fitness with the supplied value', () => {
      const event = Instrumentation.createFeedbackCapturedEvent('dfg', '100-1K', 0.76, 300);
      expect(event.attributes['feedback.fitness']).toBe(0.76);
    });

    it('carries feedback.execution_time_ms with the supplied value', () => {
      const event = Instrumentation.createFeedbackCapturedEvent('aco', '1K-10K', 0.85, 999);
      expect(event.attributes['feedback.execution_time_ms']).toBe(999);
    });

    it('carries service.name === "wasm4pm"', () => {
      const event = Instrumentation.createFeedbackCapturedEvent('dfg', '100-1K', 0.9, 100);
      expect(event.attributes['service.name']).toBe('wasm4pm');
    });

    it('Rank 3 — feedback.fitness=0 is valid (zero-fitness edge case)', () => {
      expect(() =>
        Instrumentation.createFeedbackCapturedEvent('dfg', '<100', 0, 10)
      ).not.toThrow();
    });

    it('Rank 3 — feedback.fitness=1.0 is valid (perfect fitness)', () => {
      const event = Instrumentation.createFeedbackCapturedEvent('dfg', '100-1K', 1.0, 50);
      expect(event.attributes['feedback.fitness']).toBe(1.0);
    });
  });

  // ── Cross-event: OTEL event structural invariants ─────────────────────────

  describe('Rank 1 — structural invariants apply to all new event types', () => {
    const newEvents: OtelEvent[] = [
      Instrumentation.createConformanceCacheHitEvent('lh', 'mh', true, 10),
      Instrumentation.createConformanceCacheMissEvent('lh', 'mh', 'not_found'),
      Instrumentation.createDedupHitEvent('/path/to/log.xes', 'dfg', 500),
      Instrumentation.createFeedbackCapturedEvent('dfg', '100-1K', 0.9, 100),
    ];

    it('every new event has a non-empty trace_id', () => {
      for (const ev of newEvents) {
        expect(typeof ev.trace_id).toBe('string');
        expect(ev.trace_id.length).toBeGreaterThan(0);
      }
    });

    it('every new event has a 16-char hex span_id', () => {
      for (const ev of newEvents) {
        expect(ev.span_id).toMatch(/^[0-9a-f]{16}$/);
      }
    });

    it('every new event has start_time in nanoseconds (> 2020-01-01 in ns)', () => {
      const jan2020Ns = new Date('2020-01-01').getTime() * 1_000_000;
      for (const ev of newEvents) {
        expect(ev.start_time).toBeGreaterThan(jan2020Ns);
      }
    });

    it('every new event has end_time >= start_time', () => {
      for (const ev of newEvents) {
        if (ev.end_time !== undefined) {
          expect(ev.end_time).toBeGreaterThanOrEqual(ev.start_time);
        }
      }
    });

    it('every new event kind is INTERNAL', () => {
      for (const ev of newEvents) {
        expect(ev.kind).toBe('INTERNAL');
      }
    });

    it('every new event has a non-empty name', () => {
      for (const ev of newEvents) {
        expect(typeof ev.name).toBe('string');
        expect(ev.name.length).toBeGreaterThan(0);
      }
    });
  });
});
