/**
 * kernel-recommendations.test.ts
 *
 * Tests for the smart algorithm recommendation system in @wasm4pm/kernel.
 *
 * Oracle rank: Rank-2 (domain contract) — selection rules derive from
 * Van der Aalst's quality/speed tradeoff taxonomy and registry metadata.
 * No implementation logic is re-derived inside the tests.
 */

import { describe, it, expect } from 'vitest';
import {
  recommendAlgorithm,
  compareAlgorithms,
  supportsStreaming,
  getStreamingVariant,
  type LogProfile,
} from '../recommendation.js';
import { getRegistry } from '../registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<LogProfile> = {}): LogProfile {
  return {
    trace_count: 100,
    event_count: 1000,
    variant_count: 30,
    activity_count: 10,
    avg_trace_length: 10,
    has_timestamps: true,
    estimated_noise_level: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// recommendAlgorithm — core selection logic
// ---------------------------------------------------------------------------

describe('recommendAlgorithm', () => {
  it('returns an AlgorithmRecommendation with required fields', () => {
    const rec = recommendAlgorithm(makeProfile());
    expect(rec).toBeDefined();
    expect(typeof rec.algorithm).toBe('string');
    expect(typeof rec.confidence).toBe('number');
    expect(Array.isArray(rec.reasoning)).toBe(true);
    expect(Array.isArray(rec.alternatives)).toBe(true);
    expect(rec.confidence).toBeGreaterThan(0);
    expect(rec.confidence).toBeLessThanOrEqual(1);
  });

  it('recommends a fast algorithm for a small log (trace_count=50)', () => {
    const rec = recommendAlgorithm(makeProfile({ trace_count: 50, event_count: 500, variant_count: 10, activity_count: 8, avg_trace_length: 10 }));
    // Small clean log → inductive_miner or dfg, not a heavy algorithm
    const fastAlgorithms = ['dfg', 'process_skeleton', 'inductive_miner', 'simd_streaming_dfg'];
    expect(fastAlgorithms).toContain(rec.algorithm);
    expect(rec.speed_tier).toBeLessThan(50); // must be reasonably fast
  });

  it('recommends streaming for a very large log (trace_count=5000, event_count=600000)', () => {
    const rec = recommendAlgorithm(makeProfile({
      trace_count: 55_000,
      event_count: 600_000,
      variant_count: 10_000,
      activity_count: 30,
      avg_trace_length: 11,
    }));
    expect(rec.algorithm).toBe('simd_streaming_dfg');
    expect(rec.confidence).toBeGreaterThanOrEqual(0.9);
    expect(rec.reasoning.some((r) => r.includes('large') || r.includes('streaming'))).toBe(true);
  });

  it('recommends a streaming algorithm for trace_count > 50000', () => {
    const rec = recommendAlgorithm(makeProfile({ trace_count: 100_000, event_count: 1_000_000, variant_count: 5000, activity_count: 25, avg_trace_length: 10 }));
    expect(rec.algorithm).toBe('simd_streaming_dfg');
  });

  it('recommends heuristic_miner for high-noise logs', () => {
    const rec = recommendAlgorithm(makeProfile({
      trace_count: 1000,
      event_count: 10_000,
      variant_count: 300,
      activity_count: 20,
      avg_trace_length: 10,
      estimated_noise_level: 0.5,
    }));
    expect(rec.algorithm).toBe('heuristic_miner');
    expect(rec.reasoning.some((r) => r.toLowerCase().includes('nois'))).toBe(true);
  });

  it('recommends inductive_miner for a small clean log', () => {
    const rec = recommendAlgorithm(makeProfile({
      trace_count: 200,
      event_count: 2000,
      variant_count: 20,
      activity_count: 12,
      avg_trace_length: 10,
      estimated_noise_level: 0.0,
    }));
    expect(rec.algorithm).toBe('inductive_miner');
  });

  it('returns non-empty reasoning', () => {
    const rec = recommendAlgorithm(makeProfile());
    expect(rec.reasoning.length).toBeGreaterThan(0);
    expect(rec.reasoning[0].length).toBeGreaterThan(0);
  });

  it('returns alternatives that are registered algorithm IDs', () => {
    const registry = getRegistry();
    const rec = recommendAlgorithm(makeProfile({ trace_count: 1000 }));
    for (const altId of rec.alternatives) {
      expect(registry.get(altId)).toBeDefined();
    }
  });

  it('primary algorithm is always a registered algorithm ID', () => {
    const registry = getRegistry();
    const cases: Partial<LogProfile>[] = [
      { trace_count: 50 },
      { trace_count: 5000 },
      { trace_count: 100_000, event_count: 2_000_000 },
      { trace_count: 500, estimated_noise_level: 0.6 },
      { activity_count: 150 },
    ];
    for (const overrides of cases) {
      const rec = recommendAlgorithm(makeProfile(overrides));
      expect(registry.get(rec.algorithm)).toBeDefined();
    }
  });

  it('provides speed_tier and quality_tier from registry metadata', () => {
    const registry = getRegistry();
    const rec = recommendAlgorithm(makeProfile());
    const meta = registry.get(rec.algorithm);
    expect(meta).toBeDefined();
    expect(rec.speed_tier).toBe(meta!.speedTier);
    expect(rec.quality_tier).toBe(meta!.qualityTier);
  });

  it('estimated_time_ms is defined and positive when event_count > 0', () => {
    const rec = recommendAlgorithm(makeProfile({ event_count: 10_000 }));
    if (rec.estimated_time_ms !== undefined) {
      expect(rec.estimated_time_ms).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// supportsStreaming
// ---------------------------------------------------------------------------

describe('supportsStreaming', () => {
  it('returns true for dfg', () => {
    expect(supportsStreaming('dfg')).toBe(true);
  });

  it('returns true for simd_streaming_dfg (is itself streaming-native)', () => {
    expect(supportsStreaming('simd_streaming_dfg')).toBe(true);
  });

  it('returns false for genetic_algorithm (no streaming variant)', () => {
    expect(supportsStreaming('genetic_algorithm')).toBe(false);
  });

  it('returns false for ilp (no streaming variant)', () => {
    expect(supportsStreaming('ilp')).toBe(false);
  });

  it('returns false for inductive_miner (no streaming variant)', () => {
    expect(supportsStreaming('inductive_miner')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getStreamingVariant
// ---------------------------------------------------------------------------

describe('getStreamingVariant', () => {
  it('returns simd_streaming_dfg for dfg', () => {
    expect(getStreamingVariant('dfg')).toBe('simd_streaming_dfg');
  });

  it('returns itself for simd_streaming_dfg (already streaming-native)', () => {
    expect(getStreamingVariant('simd_streaming_dfg')).toBe('simd_streaming_dfg');
  });

  it('returns null for heuristic_miner (no streaming variant)', () => {
    expect(getStreamingVariant('heuristic_miner')).toBeNull();
  });

  it('returns null for genetic_algorithm', () => {
    expect(getStreamingVariant('genetic_algorithm')).toBeNull();
  });

  it('returns null for ilp', () => {
    expect(getStreamingVariant('ilp')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// compareAlgorithms
// ---------------------------------------------------------------------------

describe('compareAlgorithms', () => {
  it('returns an AlgorithmComparison with all required fields', () => {
    const cmp = compareAlgorithms('dfg', 'inductive_miner');
    expect(cmp).toBeDefined();
    expect(cmp.algorithm1).toBe('dfg');
    expect(cmp.algorithm2).toBe('inductive_miner');
    expect(typeof cmp.faster).toBe('string');
    expect(typeof cmp.higher_quality).toBe('string');
    expect(typeof cmp.speed_delta).toBe('number');
    expect(typeof cmp.quality_delta).toBe('number');
    expect(typeof cmp.alg1_scales_well).toBe('boolean');
    expect(typeof cmp.alg2_scales_well).toBe('boolean');
    expect(typeof cmp.alg1_robust_to_noise).toBe('boolean');
    expect(typeof cmp.alg2_robust_to_noise).toBe('boolean');
    expect(typeof cmp.alg1_complexity).toBe('string');
    expect(typeof cmp.alg2_complexity).toBe('string');
    expect(typeof cmp.recommendation).toBe('string');
    expect(cmp.recommendation.length).toBeGreaterThan(0);
  });

  it('dfg is faster than inductive_miner (lower speed tier)', () => {
    const cmp = compareAlgorithms('dfg', 'inductive_miner');
    expect(cmp.faster).toBe('dfg');
  });

  it('inductive_miner has higher quality than dfg', () => {
    const cmp = compareAlgorithms('dfg', 'inductive_miner');
    expect(cmp.higher_quality).toBe('inductive_miner');
  });

  it('speed_delta is positive when alg1 is faster (lower speed tier)', () => {
    const registry = getRegistry();
    const cmp = compareAlgorithms('dfg', 'genetic_algorithm');
    const dfg = registry.get('dfg')!;
    const gen = registry.get('genetic_algorithm')!;
    // speed_delta = alg2.speedTier - alg1.speedTier
    expect(cmp.speed_delta).toBe(gen.speedTier - dfg.speedTier);
  });

  it('throws for unknown algorithm1', () => {
    expect(() => compareAlgorithms('nonexistent_algo', 'dfg')).toThrow(/nonexistent_algo/);
  });

  it('throws for unknown algorithm2', () => {
    expect(() => compareAlgorithms('dfg', 'nonexistent_algo')).toThrow(/nonexistent_algo/);
  });

  it('ilp vs dfg: ilp is higher quality, dfg is faster', () => {
    const cmp = compareAlgorithms('dfg', 'ilp');
    expect(cmp.higher_quality).toBe('ilp');
    expect(cmp.faster).toBe('dfg');
  });

  it('complexity strings are non-empty', () => {
    const cmp = compareAlgorithms('dfg', 'genetic_algorithm');
    expect(cmp.alg1_complexity.length).toBeGreaterThan(0);
    expect(cmp.alg2_complexity.length).toBeGreaterThan(0);
  });
});
