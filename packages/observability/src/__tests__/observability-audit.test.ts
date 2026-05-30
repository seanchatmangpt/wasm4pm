/**
 * observability-audit.test.ts
 *
 * Comprehensive audit of 6 undertested observability modules:
 *   1. root-cause        (diagnose conformance failures)
 *   2. feedback-loop     (capture & aggregate quality metrics)
 *   3. live-coverage     (LIVE rule coverage map)
 *   4. model-complexity  (structural complexity metrics)
 *   5. algorithm-ranking (multi-algorithm comparison — uses real disk feedback)
 *   6. discovery-cache   (TTL-based discovery result cache)
 *
 * 5 tests per module = 30 tests total.
 * No mocks — all tests use real implementations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

// ─── 1. root-cause ─────────────────────────────────────────────────────────────
import {
  diagnose,
  type ConformanceResult,
  type LogStats,
} from '../root-cause.js';

// ─── 2. feedback-loop ──────────────────────────────────────────────────────────
import {
  getLogSizeBucket,
  estimateGeneralization,
  estimateSimplicity,
  captureFeedback,
  loadAlgorithmFeedback,
  type QualityMetrics,
} from '../feedback-loop.js';

// ─── 3. live-coverage ─────────────────────────────────────────────────────────
import {
  LIVE_COVERAGE,
  coveredRules,
  uncoveredRules,
  coverageRatio,
} from '../live-coverage.js';

// ─── 4. model-complexity ──────────────────────────────────────────────────────
import {
  computeComplexity,
  computeQualitySummary,
  rankModelsByComplexity,
  type ModelIR,
} from '../model-complexity.js';

// ─── 5. algorithm-ranking ─────────────────────────────────────────────────────
import {
  rankAlgorithms,
  formatAlgorithmComparison,
  getAlgorithmComparison,
} from '../algorithm-ranking.js';

// ─── 6. discovery-cache ────────────────────────────────────────────────────────
import {
  DiscoveryCache,
  generateDiscoveryCacheKey,
  resetDiscoveryCache,
} from '../discovery-cache.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeModel(nodeCount: number, edgeCount: number, type: ModelIR['model_type'] = 'dfg'): ModelIR {
  return {
    model_type: type,
    algorithm_id: type === 'petri_net' ? 'alpha_plus_plus' : 'dfg',
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i}`,
      label: `Activity ${i}`,
      type: type === 'petri_net' && i % 2 === 0 ? 'place' : 'transition',
    })),
    edges: Array.from(
      { length: Math.min(edgeCount, nodeCount * Math.max(nodeCount - 1, 1)) },
      (_, i) => ({ from: `n${i % nodeCount}`, to: `n${(i + 1) % nodeCount}` })
    ),
  };
}

function makeConformance(fitness: number, precision: number | null = 0.85): ConformanceResult {
  return {
    fitness,
    precision,
    conformance_rate: fitness,
    deviating_cases: Math.round((1 - fitness) * 100),
  };
}

function makeLogStats(overrides: Partial<LogStats> = {}): LogStats {
  return {
    event_count: 2000,
    trace_count: 100,
    unique_activities: 10,
    unique_variants: 25,
    min_trace_length: 3,
    max_trace_length: 20,
    avg_trace_length: 8,
    ...overrides,
  };
}

const testFeedbackDir = path.join(process.cwd(), '.wasm4pm', 'algorithm-feedback');

// ─── 1. root-cause ─────────────────────────────────────────────────────────────

describe('root-cause: diagnose()', () => {
  it('returns healthy when fitness >= 0.85', () => {
    const d = diagnose(makeConformance(0.90), makeLogStats());
    expect(d.category).toBe('healthy');
    expect(d.severity).toBe('low');
    expect(d.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns insufficient_traces for trace_count < 10', () => {
    const d = diagnose(makeConformance(0.72), makeLogStats({ trace_count: 5 }));
    expect(d.category).toBe('insufficient_traces');
    expect(d.severity).toBe('high');
    expect(d.recommendations.some(r => r.includes('50+ traces'))).toBe(true);
  });

  it('returns rework_loop when rework_ratio > 0.3', () => {
    const d = diagnose(makeConformance(0.60), makeLogStats({ rework_ratio: 0.45 }));
    expect(d.category).toBe('rework_loop');
    expect(d.metrics.rework_ratio).toBeCloseTo(0.45, 2);
  });

  it('returns activity_ordering_violation when >50% deviations are ordering faults', () => {
    const cr: ConformanceResult = {
      fitness: 0.65,
      precision: 0.70,
      conformance_rate: 0.65,
      deviating_cases: 35,
      deviating_traces: [
        {
          case_id: 'c1',
          trace_fitness: 0.5,
          tokens_missing: 2,
          tokens_remaining: 1,
          deviations: [
            { activity: 'A', deviation_type: 'activity_out_of_order' },
            { activity: 'B', deviation_type: 'activity_out_of_order' },
          ],
        },
      ],
    };
    const d = diagnose(cr, makeLogStats());
    expect(d.category).toBe('activity_ordering_violation');
    expect(d.severity).toBe('critical');
  });

  it('defaults to low_fitness for generic low-fitness case', () => {
    const d = diagnose(makeConformance(0.78, 0.88), makeLogStats({ rework_ratio: 0.10 }));
    expect(d.category).toBe('low_fitness');
    expect(d.severity).toBe('medium');
    expect(d.metrics.fitness).toBeCloseTo(0.78, 2);
  });
});

// ─── 2. feedback-loop ──────────────────────────────────────────────────────────

describe('feedback-loop utilities', () => {
  beforeEach(async () => {
    try { await fs.rm(testFeedbackDir, { recursive: true, force: true }); } catch { /* ok */ }
  });
  afterEach(async () => {
    try { await fs.rm(testFeedbackDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('getLogSizeBucket classifies all five size ranges', () => {
    expect(getLogSizeBucket(50)).toBe('0-100');
    expect(getLogSizeBucket(500)).toBe('100-1K');
    expect(getLogSizeBucket(5000)).toBe('1K-10K');
    expect(getLogSizeBucket(50000)).toBe('10K-100K');
    expect(getLogSizeBucket(500000)).toBe('100K+');
  });

  it('estimateGeneralization returns 0 when every trace is a unique variant', () => {
    expect(estimateGeneralization(100, 100)).toBe(0);
  });

  it('estimateGeneralization is close to 1 when traces cluster into one variant', () => {
    // 1 variant out of 100 traces → variantRatio = 0.01, score = 1 - 0.01 = 0.99
    expect(estimateGeneralization(1, 100)).toBeCloseTo(0.99, 2);
  });

  it('estimateSimplicity decreases monotonically as element count grows', () => {
    const s5   = estimateSimplicity(5,   1000);
    const s50  = estimateSimplicity(50,  1000);
    const s200 = estimateSimplicity(200, 1000);
    expect(s5).toBeGreaterThan(s50);
    expect(s50).toBeGreaterThan(s200);
    expect(s5).toBeGreaterThanOrEqual(0);
    expect(s200).toBeLessThanOrEqual(1);
  });

  it('captureFeedback writes JSONL and loadAlgorithmFeedback reads it back', async () => {
    const metrics: QualityMetrics = {
      fitness: 0.91,
      precision: 0.85,
      generalization: 0.78,
      simplicity: 0.72,
    };
    await captureFeedback('dfg', 5000, metrics, 123);
    const records = await loadAlgorithmFeedback('dfg');
    expect(records).toHaveLength(1);
    expect(records[0].algorithm).toBe('dfg');
    expect(records[0].metrics.fitness).toBeCloseTo(0.91, 3);
    expect(records[0].log_size_bucket).toBe('1K-10K');
    expect(records[0].execution_time_ms).toBe(123);
  });
});

// ─── 3. live-coverage ─────────────────────────────────────────────────────────

describe('live-coverage: LIVE rule coverage map', () => {
  it('LIVE_COVERAGE contains at least 10 rules', () => {
    expect(LIVE_COVERAGE.length).toBeGreaterThanOrEqual(10);
  });

  it('every rule entry has required fields with valid status values', () => {
    for (const rule of LIVE_COVERAGE) {
      expect(rule.rule).toBeTruthy();
      expect(['covered', 'partial', 'none']).toContain(rule.status);
      expect(rule.requiredSpan).toBeTruthy();
      expect(Array.isArray(rule.requiredAttributes)).toBe(true);
    }
  });

  it('coveredRules() returns only status=covered entries', () => {
    const covered = coveredRules();
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.every(r => r.status === 'covered')).toBe(true);
  });

  it('uncoveredRules() returns only non-covered entries', () => {
    const uncovered = uncoveredRules();
    expect(uncovered.every(r => r.status !== 'covered')).toBe(true);
    // covered + uncovered = total
    expect(coveredRules().length + uncovered.length).toBe(LIVE_COVERAGE.length);
  });

  it('coverageRatio() is in [0,1] and equals covered/total', () => {
    const ratio = coverageRatio();
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
    expect(ratio).toBeCloseTo(coveredRules().length / LIVE_COVERAGE.length, 10);
  });
});

// ─── 4. model-complexity ──────────────────────────────────────────────────────

describe('model-complexity: computeComplexity() and computeQualitySummary()', () => {
  it('trivial 1-node model has complexityScore < 0.2 and assessment=trivial', () => {
    const c = computeComplexity(makeModel(1, 0));
    expect(c.complexityScore).toBeLessThan(0.2);
    expect(c.assessment).toBe('trivial');
    expect(c.simplicityScore).toBeGreaterThan(0.8);
  });

  it('dense model (20 nodes, 100 edges) is more complex than sparse (5 nodes, 4 edges)', () => {
    const sparse = computeComplexity(makeModel(5, 4));
    const dense  = computeComplexity(makeModel(20, 100));
    expect(dense.complexityScore).toBeGreaterThan(sparse.complexityScore);
  });

  it('cyclomatic complexity = edges - nodes + 2 per McCabe formula', () => {
    const c = computeComplexity(makeModel(5, 6));
    expect(c.cyclomaticComplexity).toBe(6 - 5 + 2);
  });

  it('computeQualitySummary uses weights 0.35/0.30/0.20/0.15', () => {
    // fitness only
    expect(computeQualitySummary(1, 0, 0, 0).overallScore).toBeCloseTo(0.35, 5);
    // precision only
    expect(computeQualitySummary(0, 1, 0, 0).overallScore).toBeCloseTo(0.30, 5);
    // generalization only
    expect(computeQualitySummary(0, 0, 1, 0).overallScore).toBeCloseTo(0.20, 5);
    // simplicity only
    expect(computeQualitySummary(0, 0, 0, 1).overallScore).toBeCloseTo(0.15, 5);
  });

  it('rankModelsByComplexity places simplest model at rank 1', () => {
    const models = [makeModel(20, 80), makeModel(3, 2), makeModel(10, 15)];
    const ranked = rankModelsByComplexity(models);
    expect(ranked[0].rank).toBe(1);
    // Rank 1 must be the simplest (highest simplicityScore)
    expect(ranked[0].complexity.simplicityScore).toBeGreaterThanOrEqual(
      ranked[1].complexity.simplicityScore
    );
    expect(ranked[1].complexity.simplicityScore).toBeGreaterThanOrEqual(
      ranked[2].complexity.simplicityScore
    );
  });
});

// ─── 5. algorithm-ranking (real disk feedback, no mocks) ─────────────────────

describe('algorithm-ranking: rankAlgorithms() with real feedback data', () => {
  beforeEach(async () => {
    try { await fs.rm(testFeedbackDir, { recursive: true, force: true }); } catch { /* ok */ }

    // Write real feedback records for three algorithms so rankAlgorithms has data.
    const metrics = (fitness: number, precision: number): QualityMetrics => ({
      fitness, precision, generalization: null, simplicity: null,
    });

    // dfg: fast (50 ms), moderate quality
    await captureFeedback('dfg',            5000, metrics(0.75, 0.70), 50);
    // heuristic_miner: medium speed, higher quality
    await captureFeedback('heuristic_miner', 5000, metrics(0.88, 0.82), 200);
    // ilp: slow (800 ms), highest quality
    await captureFeedback('ilp',            5000, metrics(0.92, 0.90), 800);
  });

  afterEach(async () => {
    try { await fs.rm(testFeedbackDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('fitness ranking: ilp > heuristic_miner > dfg', async () => {
    const ranked = await rankAlgorithms(['dfg', 'heuristic_miner', 'ilp'], 'fitness');
    expect(ranked[0].algorithm).toBe('ilp');
    expect(ranked[1].algorithm).toBe('heuristic_miner');
    expect(ranked[2].algorithm).toBe('dfg');
  });

  it('assigns consecutive 1-based ranks', async () => {
    const ranked = await rankAlgorithms(['dfg', 'heuristic_miner', 'ilp'], 'fitness');
    expect(ranked.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('speed ranking places dfg (50 ms) first', async () => {
    const ranked = await rankAlgorithms(['dfg', 'heuristic_miner', 'ilp'], 'speed');
    expect(ranked[0].algorithm).toBe('dfg');
  });

  it('excludes algorithms that have no feedback data', async () => {
    const ranked = await rankAlgorithms(['dfg', 'no_such_algo'], 'fitness');
    expect(ranked.some(r => r.algorithm === 'no_such_algo')).toBe(false);
    expect(ranked.some(r => r.algorithm === 'dfg')).toBe(true);
  });

  it('formatAlgorithmComparison produces a ranked table with header and algorithm names', async () => {
    // getAlgorithmComparison internally calls rankAlgorithmsByPerformance which uses a fixed
    // candidate list: ['dfg', 'heuristic_miner', 'inductive_miner', 'alpha_plus_plus'].
    // Only those with real feedback data (dfg, heuristic_miner) will appear.
    const ranked = await rankAlgorithms(['dfg', 'heuristic_miner'], 'fitness');
    const comparison = { logHash: 'hash-abc', metric: 'fitness' as const, timestamp: new Date().toISOString(), algorithms: ranked };
    const formatted  = formatAlgorithmComparison(comparison);
    expect(formatted).toContain('Algorithm Ranking');
    expect(formatted).toContain('fitness');
    expect(formatted).toContain('heuristic_miner');
    expect(formatted).toContain('dfg');
    // heuristic_miner has higher fitness (0.88) so should be ranked 1
    expect(ranked[0].algorithm).toBe('heuristic_miner');
  });
});

// ─── 6. discovery-cache ────────────────────────────────────────────────────────

describe('discovery-cache: DiscoveryCache', () => {
  let cache: DiscoveryCache;

  const entry = (algo = 'dfg') => ({
    handle: `handle-${algo}`,
    algorithm: algo,
    outputType: 'dfg',
    durationMs: 120,
    hash: `hash-${algo}-abc`,
    params: { activity_key: 'concept:name' },
  });

  beforeEach(() => {
    cache = new DiscoveryCache(100, 24 * 60 * 60 * 1000);
    resetDiscoveryCache();
  });

  afterEach(() => {
    cache.clear();
    resetDiscoveryCache();
  });

  it('starts with 0 entries and 0 hits/misses', () => {
    const s = cache.stats();
    expect(s.entries).toBe(0);
    expect(s.hits).toBe(0);
    expect(s.misses).toBe(0);
  });

  it('stores and retrieves a result by the same cache key', () => {
    const key = 'dfg:log123:params456';
    cache.cacheDiscovery(key, entry());
    const result = cache.getDiscovery(key);
    expect(result).not.toBeNull();
    expect(result!.algorithm).toBe('dfg');
    expect(result!.handle).toBe('handle-dfg');
  });

  it('returns null on cache miss and increments miss counter', () => {
    expect(cache.getDiscovery('nonexistent-key')).toBeNull();
    expect(cache.stats().misses).toBe(1);
  });

  it('returns null for entries whose TTL has expired', async () => {
    const key = 'dfg:log:params';
    cache.cacheDiscovery(key, entry(), 50); // 50 ms TTL
    expect(cache.getDiscovery(key)).not.toBeNull(); // still fresh
    await new Promise(r => setTimeout(r, 80));      // wait past TTL
    expect(cache.getDiscovery(key)).toBeNull();      // expired
  });

  it('generateDiscoveryCacheKey is deterministic regardless of param insertion order', () => {
    const k1 = generateDiscoveryCacheKey('dfg', 'log-42', { b: 2, a: 1 });
    const k2 = generateDiscoveryCacheKey('dfg', 'log-42', { a: 1, b: 2 });
    expect(k1).toBe(k2);
    expect(k1).toHaveLength(64); // SHA-256 hex digest
  });
});
