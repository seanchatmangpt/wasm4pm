/**
 * planner-enhanced.test.ts
 *
 * Tests for enhanced ExecutionPlan fields, explainStructured(), and planMultiAlgorithm().
 *
 * Oracle rank: Rank-2 (domain contract) — all assertions derive from
 * the design decisions in planner.ts and explain.ts, not from
 * implementation formula re-derivation inside the tests.
 *
 * Invariants tested:
 *  1. plan() returns estimated_duration_ms (positive number)
 *  2. plan() returns quality_prediction with fitness_estimate in [0, 1]
 *  3. explainStructured() returns all required ExplainResult fields
 *  4. planMultiAlgorithm() returns one plan per candidate
 */

import { describe, it, expect } from 'vitest';
import { plan, type Config, type ExecutionPlan } from '../planner.js';
import { explainStructured, type ExplainResult } from '../explain.js';
import {
  planMultiAlgorithm,
  type MultiAlgorithmPlan,
  type AlgorithmPlanEntry,
} from '../multi-algorithm.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<Config['execution']> = {}, algorithm?: string): Config {
  return {
    version: '1.0',
    source: { format: 'xes' },
    execution: {
      profile: 'fast',
      ...overrides,
    },
    ...(algorithm ? { algorithm: { name: algorithm } } : {}),
  };
}

// ─── plan() — estimated_duration_ms ──────────────────────────────────────────

describe('plan() — estimated_duration_ms', () => {
  it('returns a positive estimated_duration_ms for the fast profile', () => {
    const result: ExecutionPlan = plan(makeConfig({ profile: 'fast' }));
    expect(typeof result.estimated_duration_ms).toBe('number');
    expect(result.estimated_duration_ms).toBeGreaterThan(0);
  });

  it('returns a positive estimated_duration_ms for the balanced profile', () => {
    const result = plan(makeConfig({ profile: 'balanced' }));
    expect(result.estimated_duration_ms).toBeGreaterThan(0);
  });

  it('returns a positive estimated_duration_ms for the quality profile', () => {
    const result = plan(makeConfig({ profile: 'quality' }));
    expect(result.estimated_duration_ms).toBeGreaterThan(0);
  });

  it('quality profile duration is >= fast profile duration (more steps)', () => {
    const fast = plan(makeConfig({ profile: 'fast' }));
    const quality = plan(makeConfig({ profile: 'quality' }));
    // quality runs more steps, so total sum is larger
    expect(quality.estimated_duration_ms).toBeGreaterThanOrEqual(fast.estimated_duration_ms);
  });
});

// ─── plan() — estimated_memory_mb ─────────────────────────────────────────────

describe('plan() — estimated_memory_mb', () => {
  it('returns a non-negative estimated_memory_mb', () => {
    const result = plan(makeConfig({ profile: 'fast' }));
    expect(typeof result.estimated_memory_mb).toBe('number');
    expect(result.estimated_memory_mb).toBeGreaterThanOrEqual(0);
  });
});

// ─── plan() — quality_prediction ─────────────────────────────────────────────

describe('plan() — quality_prediction', () => {
  it('returns quality_prediction with fitness_estimate in [0, 1]', () => {
    const result = plan(makeConfig({ profile: 'fast' }));
    expect(result.quality_prediction).toBeDefined();
    expect(typeof result.quality_prediction.fitness_estimate).toBe('number');
    expect(result.quality_prediction.fitness_estimate).toBeGreaterThanOrEqual(0);
    expect(result.quality_prediction.fitness_estimate).toBeLessThanOrEqual(1);
  });

  it('returns a valid confidence level', () => {
    const result = plan(makeConfig({ profile: 'balanced' }));
    expect(['high', 'medium', 'low']).toContain(result.quality_prediction.confidence);
  });

  it('quality profile has higher fitness_estimate than fast profile (domain contract)', () => {
    const fast = plan(makeConfig({ profile: 'fast' }));
    const quality = plan(makeConfig({ profile: 'quality' }));
    expect(quality.quality_prediction.fitness_estimate).toBeGreaterThanOrEqual(
      fast.quality_prediction.fitness_estimate
    );
  });

  it('explicit high-quality algorithm (ilp) gives high confidence', () => {
    const result = plan(makeConfig({ profile: 'quality' }, 'ilp'));
    expect(result.quality_prediction.confidence).toBe('high');
    expect(result.quality_prediction.fitness_estimate).toBeGreaterThan(0.85);
  });

  it('fitness_estimate is deterministic (same config → same estimate)', () => {
    const config = makeConfig({ profile: 'balanced' }, 'heuristic_miner');
    const a = plan(config);
    const b = plan(config);
    expect(a.quality_prediction.fitness_estimate).toBe(b.quality_prediction.fitness_estimate);
    expect(a.quality_prediction.confidence).toBe(b.quality_prediction.confidence);
  });
});

// ─── plan() — alternatives ────────────────────────────────────────────────────

describe('plan() — alternatives', () => {
  it('returns an alternatives array', () => {
    const result = plan(makeConfig({ profile: 'fast' }));
    expect(Array.isArray(result.alternatives)).toBe(true);
  });

  it('each alternative has required fields', () => {
    const result = plan(makeConfig({ profile: 'balanced' }));
    for (const alt of result.alternatives) {
      expect(typeof alt.algorithm).toBe('string');
      expect(alt.algorithm.length).toBeGreaterThan(0);
      expect(typeof alt.reason).toBe('string');
      expect(typeof alt.speed_tier).toBe('number');
      expect(typeof alt.quality_tier).toBe('number');
      expect(typeof alt.estimated_duration_ms).toBe('number');
      expect(alt.estimated_duration_ms).toBeGreaterThan(0);
    }
  });
});

// ─── plan() — warnings ───────────────────────────────────────────────────────

describe('plan() — warnings', () => {
  it('returns a warnings array (may be empty for normal configs)', () => {
    const result = plan(makeConfig({ profile: 'fast' }));
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('warns when a heavy algorithm is used with the fast profile', () => {
    const result = plan(makeConfig({ profile: 'fast' }, 'ilp'));
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('ilp') || w.includes('fast'))).toBe(true);
  });

  it('warns when a streaming algorithm is used outside the stream profile', () => {
    const result = plan(makeConfig({ profile: 'balanced' }, 'simd_streaming_dfg'));
    expect(result.warnings.some((w) => w.includes('streaming'))).toBe(true);
  });
});

// ─── explainStructured() ─────────────────────────────────────────────────────

describe('explainStructured()', () => {
  it('returns an ExplainResult object', () => {
    const result: ExplainResult = explainStructured(makeConfig({ profile: 'fast' }));
    expect(result).toBeDefined();
  });

  it('summary is a non-empty string', () => {
    const result = explainStructured(makeConfig({ profile: 'balanced' }));
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('algorithm_choice has all required fields', () => {
    const result = explainStructured(makeConfig({ profile: 'balanced' }));
    expect(typeof result.algorithm_choice.name).toBe('string');
    expect(result.algorithm_choice.name.length).toBeGreaterThan(0);
    expect(typeof result.algorithm_choice.reason).toBe('string');
    expect(typeof result.algorithm_choice.speed_tier).toBe('string');
    expect(typeof result.algorithm_choice.quality_tier).toBe('string');
  });

  it('profile_choice has all required fields', () => {
    const result = explainStructured(makeConfig({ profile: 'quality' }));
    expect(typeof result.profile_choice.name).toBe('string');
    expect(result.profile_choice.name).toBe('quality');
    expect(typeof result.profile_choice.description).toBe('string');
    expect(result.profile_choice.description.length).toBeGreaterThan(0);
  });

  it('estimated_runtime is a non-empty string', () => {
    const result = explainStructured(makeConfig({ profile: 'fast' }));
    expect(typeof result.estimated_runtime).toBe('string');
    expect(result.estimated_runtime.length).toBeGreaterThan(0);
  });

  it('academic_context is a string (may be empty for unknown algorithms)', () => {
    const result = explainStructured(makeConfig({ profile: 'fast' }));
    expect(typeof result.academic_context).toBe('string');
  });

  it('academic_context is non-empty for well-known algorithms (dfg, ilp)', () => {
    const dfgResult = explainStructured(makeConfig({ profile: 'fast' }, 'dfg'));
    expect(dfgResult.academic_context.length).toBeGreaterThan(0);
    const ilpResult = explainStructured(makeConfig({ profile: 'quality' }, 'ilp'));
    expect(ilpResult.academic_context.length).toBeGreaterThan(0);
  });

  it('plan field is the underlying ExecutionPlan', () => {
    const result = explainStructured(makeConfig({ profile: 'fast' }));
    expect(result.plan).toBeDefined();
    expect(typeof result.plan.id).toBe('string');
    expect(typeof result.plan.hash).toBe('string');
    expect(Array.isArray(result.plan.steps)).toBe(true);
  });

  it('warnings array is present', () => {
    const result = explainStructured(makeConfig({ profile: 'fast' }));
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('summary contains the profile name and algorithm name', () => {
    const result = explainStructured(makeConfig({ profile: 'balanced' }, 'heuristic_miner'));
    expect(result.summary).toContain('balanced');
    expect(result.summary).toContain('heuristic_miner');
  });

  it('inductive_miner explicit config surfaces its academic reference', () => {
    const result = explainStructured(makeConfig({ profile: 'balanced' }, 'inductive_miner'));
    expect(result.academic_context).toContain('Leemans');
  });
});

// ─── planMultiAlgorithm() ─────────────────────────────────────────────────────

describe('planMultiAlgorithm()', () => {
  const twoAlgos = ['dfg', 'heuristic_miner'];
  const threeAlgos = ['dfg', 'heuristic_miner', 'inductive_miner'];

  it('returns a MultiAlgorithmPlan with plans array', () => {
    const result: MultiAlgorithmPlan = planMultiAlgorithm(
      makeConfig({ profile: 'balanced' }),
      twoAlgos
    );
    expect(result).toBeDefined();
    expect(Array.isArray(result.plans)).toBe(true);
  });

  it('returns exactly one plan per candidate algorithm', () => {
    const result = planMultiAlgorithm(makeConfig({ profile: 'balanced' }), twoAlgos);
    expect(result.plans.length).toBe(twoAlgos.length);
  });

  it('plan entries have all required fields', () => {
    const result = planMultiAlgorithm(makeConfig({ profile: 'fast' }), twoAlgos);
    for (const entry of result.plans) {
      expect(typeof entry.algorithm).toBe('string');
      expect(entry.plan).toBeDefined();
      expect(typeof entry.estimated_duration_ms).toBe('number');
      expect(entry.estimated_duration_ms).toBeGreaterThan(0);
      expect(typeof entry.estimated_memory_mb).toBe('number');
      expect(typeof entry.fitness_estimate).toBe('number');
      expect(entry.fitness_estimate).toBeGreaterThanOrEqual(0);
      expect(entry.fitness_estimate).toBeLessThanOrEqual(1);
      expect(['high', 'medium', 'low']).toContain(entry.confidence);
    }
  });

  it('algorithm IDs in entries match the candidate list', () => {
    const result = planMultiAlgorithm(makeConfig({ profile: 'balanced' }), twoAlgos);
    const ids = result.plans.map((e) => e.algorithm);
    for (const alg of twoAlgos) {
      expect(ids).toContain(alg);
    }
  });

  it('recommended is one of the candidate algorithms', () => {
    const result = planMultiAlgorithm(makeConfig({ profile: 'balanced' }), twoAlgos);
    expect(twoAlgos).toContain(result.recommended);
  });

  it('ranked contains all candidates, each exactly once', () => {
    const result = planMultiAlgorithm(makeConfig({ profile: 'balanced' }), threeAlgos);
    expect(result.ranked.length).toBe(threeAlgos.length);
    for (const alg of threeAlgos) {
      expect(result.ranked.filter((r) => r === alg).length).toBe(1);
    }
  });

  it('selection_criteria is a non-empty string mentioning recommended algorithm', () => {
    const result = planMultiAlgorithm(makeConfig({ profile: 'balanced' }), twoAlgos);
    expect(typeof result.selection_criteria).toBe('string');
    expect(result.selection_criteria.length).toBeGreaterThan(0);
    expect(result.selection_criteria).toContain(result.recommended);
  });

  it('fast profile prefers lower-duration algorithm (speed-first)', () => {
    const result = planMultiAlgorithm(makeConfig({ profile: 'fast' }), ['dfg', 'ilp']);
    // dfg should be faster and preferred for the fast profile
    expect(result.recommended).toBe('dfg');
  });

  it('quality profile prefers higher-quality algorithm', () => {
    const result = planMultiAlgorithm(makeConfig({ profile: 'quality' }), ['dfg', 'ilp']);
    // ilp has higher quality and should be preferred for quality profile
    expect(result.recommended).toBe('ilp');
  });

  it('throws when candidates list is empty', () => {
    expect(() => planMultiAlgorithm(makeConfig({ profile: 'fast' }), [])).toThrow();
  });

  it('works with a single candidate', () => {
    const result = planMultiAlgorithm(makeConfig({ profile: 'fast' }), ['dfg']);
    expect(result.plans.length).toBe(1);
    expect(result.recommended).toBe('dfg');
    expect(result.ranked.length).toBe(1);
  });
});
