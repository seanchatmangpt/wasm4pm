import { describe, it, expect } from 'vitest';
import {
  ALGO_BENCH_COSTS,
  estimateDurationMs,
  benchSpeedScore,
  benchSpeedTier,
} from '../benchmark-costs.js';

describe('ALGO_BENCH_COSTS', () => {
  it('contains all 10 measured algorithms', () => {
    const expected = [
      'dfg', 'heuristic_miner', 'inductive_miner', 'ilp',
      'hill_climbing', 'simulated_annealing', 'transition_system',
      'log_to_trie', 'batches', 'correlation_miner',
    ];
    for (const id of expected) {
      expect(ALGO_BENCH_COSTS).toHaveProperty(id);
    }
  });

  it('inductive_miner has the lowest dispatchUs (fastest)', () => {
    const min = Math.min(...Object.values(ALGO_BENCH_COSTS).map((c) => c.dispatchUs));
    expect(ALGO_BENCH_COSTS['inductive_miner']!.dispatchUs).toBe(min);
  });

  it('heuristic_miner has the highest dispatchUs (slowest)', () => {
    const max = Math.max(...Object.values(ALGO_BENCH_COSTS).map((c) => c.dispatchUs));
    expect(ALGO_BENCH_COSTS['heuristic_miner']!.dispatchUs).toBe(max);
  });
});

describe('estimateDurationMs', () => {
  it('returns undefined for unmeasured algorithm', () => {
    expect(estimateDurationMs('genetic_algorithm', 10_000)).toBeUndefined();
    expect(estimateDurationMs('nonexistent', 1_000)).toBeUndefined();
  });

  it('dfg on BPI2020 (56437 events) estimates within [3, 10] ms', () => {
    const ms = estimateDurationMs('dfg', 56_437);
    expect(ms).toBeDefined();
    expect(ms!).toBeGreaterThanOrEqual(3);
    expect(ms!).toBeLessThanOrEqual(10);
  });

  it('heuristic_miner on BPI2020 estimates within [3, 10] ms', () => {
    const ms = estimateDurationMs('heuristic_miner', 56_437);
    expect(ms).toBeDefined();
    expect(ms!).toBeGreaterThanOrEqual(3);
    expect(ms!).toBeLessThanOrEqual(10);
  });

  it('estimates scale proportionally with event count', () => {
    const small = estimateDurationMs('dfg', 1_000)!;
    const large = estimateDurationMs('dfg', 100_000)!;
    expect(large).toBeGreaterThan(small);
  });

  it('dispatch-only fallback for algorithms without nativeEventsPerSec', () => {
    // inductive_miner has no nativeEventsPerSec — result is dispatch-only, tiny
    const ms = estimateDurationMs('inductive_miner', 56_437);
    expect(ms).toBeDefined();
    expect(ms!).toBeLessThan(0.1); // dispatch overhead only: ~1.61µs + 1.61µs / 1000
  });
});

describe('benchSpeedScore', () => {
  it('returns undefined for unmeasured algorithms', () => {
    expect(benchSpeedScore('genetic_algorithm')).toBeUndefined();
    expect(benchSpeedScore('pso')).toBeUndefined();
  });

  it('inductive_miner scores 100 (fastest measured)', () => {
    expect(benchSpeedScore('inductive_miner')).toBe(100);
  });

  it('heuristic_miner scores 0 (slowest measured)', () => {
    expect(benchSpeedScore('heuristic_miner')).toBe(0);
  });

  it('all scores are in [0, 100]', () => {
    for (const id of Object.keys(ALGO_BENCH_COSTS)) {
      const score = benchSpeedScore(id);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe('benchSpeedTier', () => {
  it('returns undefined for unmeasured algorithms', () => {
    expect(benchSpeedTier('aco')).toBeUndefined();
  });

  it('inductive_miner gets the lowest tier (fastest = smallest number)', () => {
    const tier = benchSpeedTier('inductive_miner')!;
    for (const id of Object.keys(ALGO_BENCH_COSTS)) {
      expect(tier).toBeLessThanOrEqual(benchSpeedTier(id)!);
    }
  });

  it('heuristic_miner gets the highest tier (slowest = largest number)', () => {
    const tier = benchSpeedTier('heuristic_miner')!;
    for (const id of Object.keys(ALGO_BENCH_COSTS)) {
      expect(tier).toBeGreaterThanOrEqual(benchSpeedTier(id)!);
    }
  });

  it('all tiers are in [5, 70]', () => {
    for (const id of Object.keys(ALGO_BENCH_COSTS)) {
      const tier = benchSpeedTier(id)!;
      expect(tier).toBeGreaterThanOrEqual(5);
      expect(tier).toBeLessThanOrEqual(70);
    }
  });

  it('heuristic_miner tier > dfg tier (ordering preserved)', () => {
    expect(benchSpeedTier('heuristic_miner')!).toBeGreaterThan(benchSpeedTier('dfg')!);
  });
});
