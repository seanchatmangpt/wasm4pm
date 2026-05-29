/**
 * Regression tests for audit fixes applied 2026-05-28.
 *
 * Covers five defects identified in the planner audit:
 *   FIX-1: validatePlan() catches empty execution plan (no steps, no graph nodes)
 *   FIX-2: plan() rejects stream profile + full-log algorithm override
 *   FIX-3: plan() rejects algorithm parameters that exceed registry max limits
 *   FIX-4: explain() surfaces quality/speed advisory for algorithm overrides
 *   FIX-5: PlannerLike interface is exported from @wasm4pm/planner
 *
 * Oracle rank: 1 (structural invariants) and 2 (domain contracts).
 */

import { describe, it, expect } from 'vitest';
import { plan, PlannerError } from '../planner.js';
import type { Config, ExecutionPlan } from '../planner.js';
import type { PlannerLike } from '../index.js';
import { explain } from '../explain.js';
import { validatePlan, assertPlanValid } from '../validation.js';

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'fast' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FIX-1: validatePlan() catches empty execution plan
// ---------------------------------------------------------------------------

describe('FIX-1: validatePlan() — empty execution plan', () => {
  it('flags a plan with zero steps as a critical error', () => {
    const validPlan = plan(makeConfig());
    const emptyPlan: ExecutionPlan = {
      ...validPlan,
      steps: [],
      graph: { nodes: [], edges: [] },
    };
    const errors = validatePlan(emptyPlan);
    const critical = errors.filter((e) => e.severity === 'error');
    expect(critical.length).toBeGreaterThan(0);
    // At least one error must reference "steps"
    expect(critical.some((e) => e.path === 'steps')).toBe(true);
  });

  it('flags a plan where graph.nodes is empty but steps is non-empty', () => {
    const validPlan = plan(makeConfig());
    const brokenPlan: ExecutionPlan = {
      ...validPlan,
      graph: { nodes: [], edges: [] },
      // steps is still populated — topology is broken
    };
    const errors = validatePlan(brokenPlan);
    const critical = errors.filter((e) => e.severity === 'error');
    expect(critical.length).toBeGreaterThan(0);
  });

  it('assertPlanValid() throws on empty plan', () => {
    const validPlan = plan(makeConfig());
    const emptyPlan: ExecutionPlan = {
      ...validPlan,
      steps: [],
      graph: { nodes: [], edges: [] },
    };
    expect(() => assertPlanValid(emptyPlan)).toThrow(/Invalid execution plan/);
  });
});

// ---------------------------------------------------------------------------
// FIX-2: plan() rejects stream profile + full-log algorithm overrides
// ---------------------------------------------------------------------------

describe('FIX-2: plan() — stream profile + heavy algorithm incompatibility', () => {
  const STREAM_INCOMPATIBLE = ['ilp', 'genetic_algorithm', 'pso', 'aco', 'a_star', 'simulated_annealing', 'alignments'];

  for (const algo of STREAM_INCOMPATIBLE) {
    it(`throws PlannerError for stream profile + algorithm="${algo}"`, () => {
      expect(() =>
        plan(makeConfig({
          execution: { profile: 'stream' },
          algorithm: { name: algo },
        }))
      ).toThrow(PlannerError);
    });

    it(`PlannerError message for "${algo}" mentions both algorithm name and "stream" profile`, () => {
      try {
        plan(makeConfig({
          execution: { profile: 'stream' },
          algorithm: { name: algo },
        }));
        // Should have thrown
        expect.fail('plan() should have thrown PlannerError');
      } catch (err) {
        expect(err).toBeInstanceOf(PlannerError);
        const msg = (err as Error).message;
        expect(msg).toContain(algo);
        expect(msg).toContain('stream');
      }
    });
  }

  it('does NOT throw for stream profile + dfg (compatible)', () => {
    expect(() =>
      plan(makeConfig({
        execution: { profile: 'stream' },
        algorithm: { name: 'dfg' },
      }))
    ).not.toThrow();
  });

  it('does NOT throw for quality profile + ilp (compatible)', () => {
    expect(() =>
      plan(makeConfig({
        execution: { profile: 'quality' },
        algorithm: { name: 'ilp' },
      }))
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FIX-3: plan() rejects algorithm parameters that exceed registry limits
// ---------------------------------------------------------------------------

describe('FIX-3: plan() — algorithm parameter limit validation', () => {
  it('throws PlannerError when population_size exceeds max=500 for genetic_algorithm', () => {
    expect(() =>
      plan(makeConfig({
        execution: { profile: 'quality' },
        algorithm: { name: 'genetic_algorithm', parameters: { population_size: 100000 } },
      }))
    ).toThrow(PlannerError);
  });

  it('error message names the violating parameter and value', () => {
    try {
      plan(makeConfig({
        execution: { profile: 'quality' },
        algorithm: { name: 'genetic_algorithm', parameters: { population_size: 999 } },
      }));
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PlannerError);
      const msg = (err as Error).message;
      expect(msg).toContain('population_size');
      expect(msg).toContain('genetic_algorithm');
    }
  });

  it('throws when swarm_size exceeds max=300 for pso', () => {
    expect(() =>
      plan(makeConfig({
        execution: { profile: 'quality' },
        algorithm: { name: 'pso', parameters: { swarm_size: 50000 } },
      }))
    ).toThrow(PlannerError);
  });

  it('throws when max_iterations exceeds max=100000 for a_star', () => {
    expect(() =>
      plan(makeConfig({
        execution: { profile: 'quality' },
        algorithm: { name: 'a_star', parameters: { max_iterations: 999999 } },
      }))
    ).toThrow(PlannerError);
  });

  it('throws when dependency_threshold < min=0 for heuristic_miner', () => {
    expect(() =>
      plan(makeConfig({
        execution: { profile: 'balanced' },
        algorithm: { name: 'heuristic_miner', parameters: { dependency_threshold: -0.5 } },
      }))
    ).toThrow(PlannerError);
  });

  it('does NOT throw when population_size = 50 (within bounds, default)', () => {
    expect(() =>
      plan(makeConfig({
        execution: { profile: 'quality' },
        algorithm: { name: 'genetic_algorithm', parameters: { population_size: 50 } },
      }))
    ).not.toThrow();
  });

  it('does NOT throw when population_size = 500 (at boundary max)', () => {
    expect(() =>
      plan(makeConfig({
        execution: { profile: 'quality' },
        algorithm: { name: 'genetic_algorithm', parameters: { population_size: 500 } },
      }))
    ).not.toThrow();
  });

  it('does NOT throw for algorithm without known limits (unknown params pass through)', () => {
    // dfg has no registered limits — any parameter should pass through
    expect(() =>
      plan(makeConfig({
        algorithm: { name: 'dfg', parameters: { activity_key: 'concept:name', extra_param: 'anything' } },
      }))
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FIX-4: explain() surfaces algorithm quality/speed advisory
// ---------------------------------------------------------------------------

describe('FIX-4: explain() — algorithm advisory in output', () => {
  it('explains ilp + quality profile with quality score in output', () => {
    const text = explain(makeConfig({
      execution: { profile: 'quality' },
      algorithm: { name: 'ilp' },
    }));
    // Advisory should mention quality score and output type
    expect(text).toMatch(/quality.*90|90.*quality/i);
    expect(text).toContain('ILP');
  });

  it('explains ilp with NP-Hard complexity warning', () => {
    const text = explain(makeConfig({
      execution: { profile: 'quality' },
      algorithm: { name: 'ilp' },
    }));
    expect(text).toMatch(/NP-Hard|Exponential/);
  });

  it('explains ilp with scale warning (does not scale to large logs)', () => {
    const text = explain(makeConfig({
      execution: { profile: 'quality' },
      algorithm: { name: 'ilp' },
    }));
    // Should warn about large log scaling
    expect(text).toMatch(/scale|large log|100k/i);
  });

  it('explains genetic_algorithm with speed tier and quality tier', () => {
    const text = explain(makeConfig({
      execution: { profile: 'quality' },
      algorithm: { name: 'genetic_algorithm' },
    }));
    // Quality score = 80, speed tier = 75
    expect(text).toContain('80');
    expect(text).toContain('75');
  });

  it('explains dfg with "very fast" speed label', () => {
    const text = explain(makeConfig({
      algorithm: { name: 'dfg' },
    }));
    expect(text).toMatch(/very fast|sub-millisecond/i);
  });

  it('explains balanced profile — profile-default discovery steps get advisory', () => {
    const text = explain(makeConfig({
      execution: { profile: 'balanced' },
    }));
    // balanced profile includes heuristic_miner which has quality 50
    // The advisory for heuristic_miner should appear in at least one step
    expect(text).toMatch(/Algorithm Advisory/);
  });

  it('advisory appears in algorithm override section of explain() output', () => {
    const text = explain(makeConfig({
      execution: { profile: 'quality' },
      algorithm: { name: 'a_star' },
    }));
    // Algorithm override section should reference advisory
    expect(text).toMatch(/Algorithm Advisory/);
    expect(text).toMatch(/Algorithm Override/);
  });

  it('output type is shown in advisory (petrinet, dfg, etc.)', () => {
    const text = explain(makeConfig({
      execution: { profile: 'quality' },
      algorithm: { name: 'ilp' },
    }));
    // ILP output type = petrinet
    expect(text).toContain('petrinet');
  });
});

// ---------------------------------------------------------------------------
// FIX-5: PlannerLike interface is exported and satisfies both sync and async
// ---------------------------------------------------------------------------

describe('FIX-5: PlannerLike interface', () => {
  it('the synchronous plan() function satisfies PlannerLike', () => {
    // This is a compile-time check that also validates at runtime
    // by confirming the shape is correct.
    const syncPlanner = {
      plan: (config: Config): ExecutionPlan => plan(config),
    };

    // If this TypeScript assignment compiles (i.e. no type error here), PlannerLike
    // accepts sync implementations. We verify the function is callable.
    const _p: PlannerLike = syncPlanner;
    const result = syncPlanner.plan(makeConfig());
    expect(result.id).toBeTruthy();
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('an async plan() wrapper satisfies PlannerLike', () => {
    const asyncPlanner = {
      plan: async (config: Config): Promise<ExecutionPlan> => Promise.resolve(plan(config)),
    };

    const _p: PlannerLike = asyncPlanner;
    expect(typeof asyncPlanner.plan).toBe('function');
  });

  it('PlannerLike.plan returns a result usable as ExecutionPlan', async () => {
    const planner: PlannerLike = {
      plan: (config: Config) => plan(config),
    };
    const result = await Promise.resolve(planner.plan(makeConfig()));
    // validatePlan() confirms it's a structurally valid ExecutionPlan
    const errors = validatePlan(result as ExecutionPlan);
    const critical = errors.filter((e) => e.severity === 'error');
    expect(critical).toHaveLength(0);
  });
});
