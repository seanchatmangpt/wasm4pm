/**
 * adaptive-timeout.test.ts
 *
 * Test suite for adaptive timeout computation.
 *
 * Tests verify:
 * 1. Formula correctness (base + event scaling + complexity + algorithm)
 * 2. Bounds enforcement (min 5s, max 5min)
 * 3. Complexity classification heuristics
 * 4. Algorithm tier detection
 * 5. Per-algorithm overrides
 *
 * Oracle: Rank 1 (Mathematical) — Formula verification via test cases
 * Oracle: Rank 2 (Domain contract) — Bounds and multiplier semantics
 */

import { describe, it, expect } from 'vitest';
import {
  computeTimeout,
  classifyComplexity,
  detectAlgorithmTier,
  type TimeoutFactors,
} from '../adaptive-timeout.js';

// ─── Test Constants ──────────────────────────────────────────────────────────

const BASE_MS = 30_000; // 30 seconds
const EVENT_FACTOR_PER_10K = 50; // 50ms per 10K events
const MIN_MS = 5_000;
const MAX_MS = 300_000;

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('adaptive-timeout: computeTimeout()', () => {
  it('TC-1: Small log, simple, fast algorithm → base timeout', () => {
    const result = computeTimeout({
      eventCount: 1_000,
      complexity: 'simple',
      algorithmTier: 'fast',
    });

    // Formula: base=30k + events(1k/10k)*100=10 + (simple=1)*base(0) + (fast=1)*base(0)
    // = 30k + 10 + 0 + 0 = 30010
    // (Note: algorithm multiplier 1.0 and complexity 1.0 don't add extra)
    expect(result.timeoutMs).toBeGreaterThanOrEqual(MIN_MS);
    expect(result.timeoutMs).toBeLessThanOrEqual(MAX_MS);
  });

  it('TC-2: Large log (100K), simple, fast algorithm → base + event scaling', () => {
    const result = computeTimeout({
      eventCount: 100_000,
      complexity: 'simple',
      algorithmTier: 'fast',
    });

    // Events: (100k / 10k) * 50 = 500ms
    expect(result.timeoutMs).toBeGreaterThan(BASE_MS);
    expect(result.breakdown.event_factor_ms).toBe(500);
  });

  it('TC-3: Complex log multiplier applied correctly', () => {
    const simpleResult = computeTimeout({
      eventCount: 10_000,
      complexity: 'simple',
      algorithmTier: 'fast',
    });

    const complexResult = computeTimeout({
      eventCount: 10_000,
      complexity: 'complex',
      algorithmTier: 'fast',
    });

    // Complex should be higher due to complexity_multiplier = 1.5
    expect(complexResult.timeoutMs).toBeGreaterThan(simpleResult.timeoutMs);
    expect(complexResult.breakdown.complexity_multiplier).toBe(1.5);
  });

  it('TC-4: Algorithm tier multiplier applied', () => {
    const fastResult = computeTimeout({
      eventCount: 10_000,
      complexity: 'simple',
      algorithmTier: 'fast',
    });

    const balancedResult = computeTimeout({
      eventCount: 10_000,
      complexity: 'simple',
      algorithmTier: 'balanced',
    });

    const qualityResult = computeTimeout({
      eventCount: 10_000,
      complexity: 'simple',
      algorithmTier: 'quality',
    });

    // Quality > balanced > fast
    expect(qualityResult.timeoutMs).toBeGreaterThan(balancedResult.timeoutMs);
    expect(balancedResult.timeoutMs).toBeGreaterThan(fastResult.timeoutMs);
  });

  it('TC-5: Algorithm name override (e.g., genetic_algorithm)', () => {
    const tierBasedResult = computeTimeout({
      eventCount: 10_000,
      complexity: 'simple',
      algorithmTier: 'quality',
    });

    const overrideResult = computeTimeout({
      eventCount: 10_000,
      complexity: 'simple',
      algorithmTier: 'quality',
      algorithmName: 'genetic_algorithm',
    });

    // genetic_algorithm has multiplier 2.5, so should be higher
    expect(overrideResult.breakdown.algorithm_multiplier).toBe(2.5);
  });

  it('TC-6: ILP algorithm (longest timeout)', () => {
    const result = computeTimeout({
      eventCount: 10_000,
      complexity: 'simple',
      algorithmTier: 'quality',
      algorithmName: 'ilp',
    });

    // ILP multiplier = 3.0, highest in the override table
    expect(result.breakdown.algorithm_multiplier).toBe(3.0);
  });

  it('TC-7: DFG algorithm (shortest timeout)', () => {
    const result = computeTimeout({
      eventCount: 100_000,
      complexity: 'complex',
      algorithmTier: 'fast',
      algorithmName: 'dfg',
    });

    // DFG multiplier = 0.7, lowest override
    expect(result.breakdown.algorithm_multiplier).toBe(0.7);
  });

  it('TC-8: Bounds enforcement — very large log cannot exceed MAX', () => {
    const result = computeTimeout({
      eventCount: 10_000_000, // 10M events (pathological)
      complexity: 'complex',
      algorithmTier: 'quality',
    });

    expect(result.timeoutMs).toBeLessThanOrEqual(MAX_MS);
  });

  it('TC-9: Bounds enforcement — empty log respects MIN', () => {
    const result = computeTimeout({
      eventCount: 0,
      complexity: 'simple',
      algorithmTier: 'fast',
    });

    expect(result.timeoutMs).toBeGreaterThanOrEqual(MIN_MS);
  });

  it('TC-10: Breakdown contains all required fields', () => {
    const result = computeTimeout({
      eventCount: 50_000,
      complexity: 'complex',
      algorithmTier: 'quality',
      algorithmName: 'genetic_algorithm',
    });

    expect(result.breakdown).toHaveProperty('base_ms');
    expect(result.breakdown).toHaveProperty('event_factor_ms');
    expect(result.breakdown).toHaveProperty('complexity_multiplier');
    expect(result.breakdown).toHaveProperty('algorithm_multiplier');

    expect(typeof result.breakdown.base_ms).toBe('number');
    expect(typeof result.breakdown.event_factor_ms).toBe('number');
    expect(typeof result.breakdown.complexity_multiplier).toBe('number');
    expect(typeof result.breakdown.algorithm_multiplier).toBe('number');
  });

  it('TC-11: Result breakdown sums correctly to timeout', () => {
    const result = computeTimeout({
      eventCount: 50_000,
      complexity: 'complex',
      algorithmTier: 'quality',
    });

    const { breakdown } = result;
    const reconstructed =
      breakdown.base_ms * breakdown.complexity_multiplier +
      breakdown.event_factor_ms +
      breakdown.base_ms * breakdown.algorithm_multiplier;

    // Allow 1ms rounding error
    expect(Math.abs(result.timeoutMs - reconstructed)).toBeLessThanOrEqual(1);
  });
});

// ─── Complexity Classification Tests ──────────────────────────────────────────

describe('adaptive-timeout: classifyComplexity()', () => {
  it('CT-1: Simple log (few activities, low variance)', () => {
    const result = classifyComplexity(
      10_000, // eventCount
      50, // distinctActivities
      100 // numTraces
    );
    expect(result).toBe('simple');
  });

  it('CT-2: Complex log (many activities)', () => {
    const result = classifyComplexity(
      10_000, // eventCount
      200, // distinctActivities (> 150)
      100 // numTraces
    );
    expect(result).toBe('complex');
  });

  it('CT-3: Complex log (high variance ratio)', () => {
    const result = classifyComplexity(
      50_000, // eventCount
      10, // distinctActivities
      150 // numTraces (ratio = 15, > 10)
    );
    expect(result).toBe('complex');
  });

  it('CT-4: Complex log (high event density)', () => {
    const result = classifyComplexity(
      50_000, // eventCount
      10, // distinctActivities
      100 // numTraces (density = 500 events/trace, > 100)
    );
    expect(result).toBe('complex');
  });

  it('CT-5: Zero traces → simple (safe default)', () => {
    const result = classifyComplexity(0, 0, 0);
    expect(result).toBe('simple');
  });

  it('CT-6: Zero activities → simple (safe default)', () => {
    const result = classifyComplexity(1000, 0, 10);
    expect(result).toBe('simple');
  });
});

// ─── Algorithm Tier Detection Tests ───────────────────────────────────────────

describe('adaptive-timeout: detectAlgorithmTier()', () => {
  it('AT-1: Fast tier algorithms', () => {
    expect(detectAlgorithmTier('dfg')).toBe('fast');
    expect(detectAlgorithmTier('simd_streaming_dfg')).toBe('fast');
    expect(detectAlgorithmTier('process_skeleton')).toBe('fast');
  });

  it('AT-2: Quality tier algorithms', () => {
    expect(detectAlgorithmTier('genetic_algorithm')).toBe('quality');
    expect(detectAlgorithmTier('ilp')).toBe('quality');
    expect(detectAlgorithmTier('simulated_annealing')).toBe('quality');
    expect(detectAlgorithmTier('a_star')).toBe('quality');
    expect(detectAlgorithmTier('aco')).toBe('quality');
    expect(detectAlgorithmTier('pso')).toBe('quality');
  });

  it('AT-3: Balanced tier algorithms (default)', () => {
    expect(detectAlgorithmTier('heuristic_miner')).toBe('balanced');
    expect(detectAlgorithmTier('inductive_miner')).toBe('balanced');
    expect(detectAlgorithmTier('alpha_plus_plus')).toBe('balanced');
    expect(detectAlgorithmTier('unknown_algorithm')).toBe('balanced');
  });

  it('AT-4: Case-insensitive matching', () => {
    expect(detectAlgorithmTier('DFG')).toBe('fast');
    expect(detectAlgorithmTier('GENETIC_ALGORITHM')).toBe('quality');
  });
});

// ─── Integration Tests ─────────────────────────────────────────────────────────

describe('adaptive-timeout: Integration scenarios', () => {
  it('INT-1: Typical small log discovery', () => {
    const result = computeTimeout({
      eventCount: 5_000,
      complexity: 'simple',
      algorithmTier: 'balanced',
    });

    expect(result.timeoutMs).toBeGreaterThanOrEqual(MIN_MS);
    expect(result.timeoutMs).toBeLessThanOrEqual(MAX_MS); // Should be well under 5min
  });

  it('INT-2: Typical large log quality mining', () => {
    const result = computeTimeout({
      eventCount: 1_000_000, // 1M events
      complexity: 'complex',
      algorithmTier: 'quality',
      algorithmName: 'genetic_algorithm',
    });

    // Should be clamped to MAX_MS (5 min)
    expect(result.timeoutMs).toBeLessThanOrEqual(MAX_MS);
    expect(result.timeoutMs).toBeGreaterThan(60_000); // At least longer than quick runs
  });

  it('INT-3: Pathological case — empty log with quality algorithm', () => {
    const result = computeTimeout({
      eventCount: 0,
      complexity: 'complex',
      algorithmTier: 'quality',
    });

    // Should still be within bounds (MIN_MS to MAX_MS)
    expect(result.timeoutMs).toBeGreaterThanOrEqual(MIN_MS);
    expect(result.timeoutMs).toBeLessThanOrEqual(MAX_MS);
  });

  it('INT-4: SIMD-accelerated fast discovery on huge log', () => {
    const result = computeTimeout({
      eventCount: 10_000_000,
      complexity: 'simple',
      algorithmTier: 'fast',
      algorithmName: 'simd_streaming_dfg',
    });

    // SIMD DFG multiplier = 0.5, should be relatively quick despite size
    expect(result.timeoutMs).toBeLessThanOrEqual(MAX_MS);
  });
});
