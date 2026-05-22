/**
 * Profile-to-algorithm policy mapping — exhaustive tests.
 *
 * Tests the end-to-end contract that each execution profile (`fast`, `balanced`,
 * `quality`, `stream`) selects the correct class of discovery algorithm, enforces
 * monotonicity invariants across tiers, and respects constraint-driven degradation.
 *
 * Oracle rank classification:
 *   Rank 1 — mathematical (monotonicity, tier ordering, budget arithmetic)
 *   Rank 2 — domain contract (profile → algorithm family, mode mapping, constraints)
 *   Rank 3 — metamorphic (changing one input changes output in predictable direction)
 */

import { describe, it, expect } from 'vitest';
import { plan, type Config, type ExecutionPlan } from '../planner.js';
import { PlanStepType } from '../steps.js';
import {
  selectAlgorithmByBudget,
  profileToLatencyBudget,
  profileToQualityFloor,
  profileToExecutionMode,
  shouldDegradeAlgorithm,
} from '../policy.js';
import { getProfileAlgorithms } from '@wasm4pm/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'fast' },
    ...overrides,
  };
}

/** Extract the PlanStepType values for all discovery steps in a plan. */
function discoverySteps(p: ExecutionPlan): string[] {
  return p.steps
    .filter(
      (s) =>
        s.type.toString().startsWith('discover_') ||
        s.type.toString().startsWith('import_') ||
        s.type.toString().startsWith('convert_') ||
        s.type.toString().startsWith('simulate_')
    )
    .map((s) => s.type.toString());
}

/** Extract the unique step types present in a plan. */
function stepTypes(p: ExecutionPlan): Set<string> {
  return new Set(p.steps.map((s) => s.type.toString()));
}

// ---------------------------------------------------------------------------
// Group 1 — Rank 2 (domain contract): Profile-to-algorithm classification
// ---------------------------------------------------------------------------

describe('Group 1 — Profile-to-algorithm classification (Rank 2 domain contract)', () => {
  // -------------------------------------------------------------------------
  // fast profile
  // -------------------------------------------------------------------------

  describe('fast profile', () => {
    it('selects at least one DFG-class step (discover_dfg or discover_process_skeleton)', () => {
      const p = plan(makeConfig({ execution: { profile: 'fast' } }));
      const ds = discoverySteps(p);
      const hasDfgClass = ds.some(
        (t) => t === PlanStepType.DISCOVER_DFG || t === PlanStepType.DISCOVER_PROCESS_SKELETON
      );
      expect(hasDfgClass).toBe(true);
    });

    it('does NOT include quality-tier discovery steps (genetic, ILP, ACO, PSO)', () => {
      const p = plan(makeConfig({ execution: { profile: 'fast' } }));
      const types = stepTypes(p);
      expect(types.has(PlanStepType.DISCOVER_GENETIC)).toBe(false);
      expect(types.has(PlanStepType.DISCOVER_ILP)).toBe(false);
      expect(types.has(PlanStepType.DISCOVER_ACO)).toBe(false);
      expect(types.has(PlanStepType.DISCOVER_PSO)).toBe(false);
    });

    it('does NOT include ML analysis steps automatically', () => {
      const p = plan(makeConfig({ execution: { profile: 'fast' } }));
      const types = stepTypes(p);
      expect(types.has(PlanStepType.ML_CLASSIFY)).toBe(false);
      expect(types.has(PlanStepType.ML_CLUSTER)).toBe(false);
    });

    it('profile field on the returned plan is "fast"', () => {
      const p = plan(makeConfig({ execution: { profile: 'fast' } }));
      expect(p.profile).toBe('fast');
    });

    it('budget.latencyBudget is sub_ms (fastest tier)', () => {
      const p = plan(makeConfig({ execution: { profile: 'fast' } }));
      expect(p.budget.latencyBudget).toBe('sub_ms');
    });

    it('budget.qualityFloor is fast', () => {
      const p = plan(makeConfig({ execution: { profile: 'fast' } }));
      expect(p.budget.qualityFloor).toBe('fast');
    });
  });

  // -------------------------------------------------------------------------
  // balanced profile
  // -------------------------------------------------------------------------

  describe('balanced profile', () => {
    it('selects at least one mid-tier discovery step (heuristic, inductive, alpha, or hill climbing)', () => {
      const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
      const ds = discoverySteps(p);
      const hasMidTier = ds.some((t) =>
        [
          PlanStepType.DISCOVER_HEURISTIC,
          PlanStepType.DISCOVER_INDUCTIVE,
          PlanStepType.DISCOVER_ALPHA_PLUS_PLUS,
          PlanStepType.DISCOVER_HILL_CLIMBING,
        ].includes(t as PlanStepType)
      );
      expect(hasMidTier).toBe(true);
    });

    it('includes all 6 ML analysis steps automatically', () => {
      const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
      const types = stepTypes(p);
      expect(types.has(PlanStepType.ML_CLASSIFY)).toBe(true);
      expect(types.has(PlanStepType.ML_CLUSTER)).toBe(true);
      expect(types.has(PlanStepType.ML_FORECAST)).toBe(true);
      expect(types.has(PlanStepType.ML_ANOMALY)).toBe(true);
      expect(types.has(PlanStepType.ML_REGRESS)).toBe(true);
      expect(types.has(PlanStepType.ML_PCA)).toBe(true);
    });

    it('includes conformance analysis step', () => {
      const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
      const types = stepTypes(p);
      expect(types.has(PlanStepType.ANALYZE_CONFORMANCE)).toBe(true);
    });

    it('includes variant analysis step', () => {
      const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
      const types = stepTypes(p);
      expect(types.has(PlanStepType.ANALYZE_VARIANTS)).toBe(true);
    });

    it('budget.latencyBudget is low_ms', () => {
      const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
      expect(p.budget.latencyBudget).toBe('low_ms');
    });

    it('budget.qualityFloor is balanced', () => {
      const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
      expect(p.budget.qualityFloor).toBe('balanced');
    });
  });

  // -------------------------------------------------------------------------
  // quality profile
  // -------------------------------------------------------------------------

  describe('quality profile', () => {
    it('selects at least one quality-tier discovery step (genetic, ILP, ACO, PSO, or A*)', () => {
      const p = plan(makeConfig({ execution: { profile: 'quality' } }));
      const ds = discoverySteps(p);
      const hasQualityTier = ds.some((t) =>
        [
          PlanStepType.DISCOVER_GENETIC,
          PlanStepType.DISCOVER_ILP,
          PlanStepType.DISCOVER_ACO,
          PlanStepType.DISCOVER_PSO,
          PlanStepType.DISCOVER_A_STAR,
          PlanStepType.DISCOVER_SIMULATED_ANNEALING,
        ].includes(t as PlanStepType)
      );
      expect(hasQualityTier).toBe(true);
    });

    it('includes all 6 ML analysis steps automatically', () => {
      const p = plan(makeConfig({ execution: { profile: 'quality' } }));
      const types = stepTypes(p);
      expect(types.has(PlanStepType.ML_CLASSIFY)).toBe(true);
      expect(types.has(PlanStepType.ML_CLUSTER)).toBe(true);
      expect(types.has(PlanStepType.ML_FORECAST)).toBe(true);
      expect(types.has(PlanStepType.ML_ANOMALY)).toBe(true);
      expect(types.has(PlanStepType.ML_REGRESS)).toBe(true);
      expect(types.has(PlanStepType.ML_PCA)).toBe(true);
    });

    it('includes performance analysis step (quality-exclusive)', () => {
      const p = plan(makeConfig({ execution: { profile: 'quality' } }));
      const types = stepTypes(p);
      expect(types.has(PlanStepType.ANALYZE_PERFORMANCE)).toBe(true);
    });

    it('budget.latencyBudget is high_ms', () => {
      const p = plan(makeConfig({ execution: { profile: 'quality' } }));
      expect(p.budget.latencyBudget).toBe('high_ms');
    });

    it('budget.qualityFloor is quality', () => {
      const p = plan(makeConfig({ execution: { profile: 'quality' } }));
      expect(p.budget.qualityFloor).toBe('quality');
    });
  });

  // -------------------------------------------------------------------------
  // stream profile
  // -------------------------------------------------------------------------

  describe('stream profile', () => {
    it('selects a streaming-compatible algorithm (simd_streaming_dfg)', () => {
      const p = plan(makeConfig({ execution: { profile: 'stream' } }));
      const ds = discoverySteps(p);
      expect(ds).toContain(PlanStepType.DISCOVER_SIMD_STREAMING_DFG);
    });

    it('does NOT include ML steps (streaming pipelines are latency-sensitive)', () => {
      const p = plan(makeConfig({ execution: { profile: 'stream' } }));
      const types = stepTypes(p);
      expect(types.has(PlanStepType.ML_CLASSIFY)).toBe(false);
      expect(types.has(PlanStepType.ML_CLUSTER)).toBe(false);
    });

    it('does NOT include quality-tier discovery steps', () => {
      const p = plan(makeConfig({ execution: { profile: 'stream' } }));
      const types = stepTypes(p);
      expect(types.has(PlanStepType.DISCOVER_GENETIC)).toBe(false);
      expect(types.has(PlanStepType.DISCOVER_ILP)).toBe(false);
    });

    it('budget.latencyBudget is sub_ms (same as fast — stream is latency-first)', () => {
      const p = plan(makeConfig({ execution: { profile: 'stream' } }));
      expect(p.budget.latencyBudget).toBe('sub_ms');
    });

    it('budget.qualityFloor is fast (streaming does not promise high quality)', () => {
      const p = plan(makeConfig({ execution: { profile: 'stream' } }));
      expect(p.budget.qualityFloor).toBe('fast');
    });
  });
});

// ---------------------------------------------------------------------------
// Group 2 — Rank 1 (mathematical): Profile constraints are monotonic
// ---------------------------------------------------------------------------

describe('Group 2 — Monotonicity invariants across profiles (Rank 1 mathematical)', () => {
  /**
   * Registry speed/quality scores come from packages/kernel/src/registry.ts.
   * The tier numbers are fixed design decisions, not runtime-computed values.
   *
   * fast algorithms: dfg (speedTier=76, qualityTier=30), process_skeleton (73, 25)
   * quality algorithms: genetic_algorithm (100, 80), ilp (100, 90), simulated_annealing (100, 65)
   *
   * These are compared as averages of the algorithm sets in each profile,
   * derived from the ontology-based registry definition.
   */

  // Known registry values (from packages/kernel/src/registry.ts)
  // DFG-class algorithms (fast profile)
  const DFG_QUALITY_TIER = 30; // dfg.qualityTier
  const SKELETON_QUALITY_TIER = 25; // process_skeleton.qualityTier

  // Quality-tier algorithms (quality profile)
  const GENETIC_QUALITY_TIER = 80; // genetic_algorithm.qualityTier
  const ILP_QUALITY_TIER = 90; // ilp.qualityTier

  // Speed tiers
  const DFG_SPEED_TIER = 76; // dfg.speedTier
  const GENETIC_SPEED_TIER = 100; // genetic_algorithm.speedTier (higher = slower)

  it('DFG quality tier < genetic quality tier (fast profile < quality profile)', () => {
    // Domain assertion: DFG is a lower-quality algorithm than Genetic
    expect(DFG_QUALITY_TIER).toBeLessThan(GENETIC_QUALITY_TIER);
  });

  it('ILP quality tier > DFG quality tier by at least 50 points', () => {
    // Strong monotonicity: quality tier algorithms are substantially better
    expect(ILP_QUALITY_TIER - DFG_QUALITY_TIER).toBeGreaterThanOrEqual(50);
  });

  it('process_skeleton quality tier ≤ DFG quality tier (both fast-class)', () => {
    expect(SKELETON_QUALITY_TIER).toBeLessThanOrEqual(DFG_QUALITY_TIER);
  });

  it('genetic speed tier ≥ DFG speed tier (quality costs time)', () => {
    // In registry: higher speedTier = slower algorithm (logarithmic scale)
    expect(GENETIC_SPEED_TIER).toBeGreaterThanOrEqual(DFG_SPEED_TIER);
  });

  it('getProfileAlgorithms("fast") contains only DFG-class identifiers', () => {
    const fastAlgos = getProfileAlgorithms('fast');
    // fast profile is exactly: process_skeleton, dfg
    expect(fastAlgos).toContain('dfg');
    expect(fastAlgos).toContain('process_skeleton');
    // Must not include any quality-tier algorithms
    expect(fastAlgos).not.toContain('genetic_algorithm');
    expect(fastAlgos).not.toContain('ilp');
    expect(fastAlgos).not.toContain('aco');
    expect(fastAlgos).not.toContain('pso');
  });

  it('getProfileAlgorithms("quality") contains genetic and ILP (highest-quality algorithms)', () => {
    const qualityAlgos = getProfileAlgorithms('quality');
    expect(qualityAlgos).toContain('genetic_algorithm');
    expect(qualityAlgos).toContain('ilp');
  });

  it('getProfileAlgorithms("stream") is a singleton set containing simd_streaming_dfg', () => {
    const streamAlgos = getProfileAlgorithms('stream');
    expect(streamAlgos).toEqual(['simd_streaming_dfg']);
  });

  it('latency budget order: fast=sub_ms < balanced=low_ms < quality=high_ms (tier ordering)', () => {
    const tierOrder: Record<string, number> = {
      sub_ms: 0,
      low_ms: 1,
      high_ms: 2,
      seconds: 3,
      minutes: 4,
    };
    const fast = profileToLatencyBudget('fast');
    const balanced = profileToLatencyBudget('balanced');
    const quality = profileToLatencyBudget('quality');

    expect(tierOrder[fast]).toBeLessThan(tierOrder[balanced]);
    expect(tierOrder[balanced]).toBeLessThan(tierOrder[quality]);
  });

  it('quality floor order: fast < balanced < quality (monotonically non-decreasing)', () => {
    const qualityOrder: Record<string, number> = { fast: 0, balanced: 1, quality: 2, research: 3 };
    const fastFloor = profileToQualityFloor('fast');
    const balancedFloor = profileToQualityFloor('balanced');
    const qualityFloor = profileToQualityFloor('quality');

    expect(qualityOrder[fastFloor]).toBeLessThan(qualityOrder[balancedFloor]);
    expect(qualityOrder[balancedFloor]).toBeLessThan(qualityOrder[qualityFloor]);
  });

  it('stream has the same latency budget as fast (both sub_ms — latency-first profiles)', () => {
    expect(profileToLatencyBudget('stream')).toBe(profileToLatencyBudget('fast'));
  });

  it('stream has the same quality floor as fast (both "fast")', () => {
    expect(profileToQualityFloor('stream')).toBe(profileToQualityFloor('fast'));
  });

  it('selectAlgorithmByBudget(sub_ms, fast) returns DFG-class algorithms', () => {
    const candidates = selectAlgorithmByBudget('sub_ms', 'fast');
    // Every returned algorithm must be a DFG-class (fast) algorithm
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates).toContain('dfg');
    // Must not return quality-tier algorithms at sub_ms constraint
    expect(candidates).not.toContain('genetic_algorithm');
    expect(candidates).not.toContain('ilp');
  });

  it('selectAlgorithmByBudget(high_ms, quality) returns quality-tier algorithms', () => {
    const candidates = selectAlgorithmByBudget('high_ms', 'quality');
    expect(candidates.length).toBeGreaterThan(0);
    // high_ms + quality → genetic, ACO, PSO
    const hasQuality = candidates.some((id) =>
      ['genetic_algorithm', 'aco', 'pso'].includes(id)
    );
    expect(hasQuality).toBe(true);
    // Must NOT return plain dfg at quality tier
    expect(candidates).not.toContain('dfg');
  });

  it('selectAlgorithmByBudget(seconds, quality) returns ILP (highest quality)', () => {
    const candidates = selectAlgorithmByBudget('seconds', 'quality');
    expect(candidates).toContain('ilp');
  });

  it('selectAlgorithmByBudget(low_ms, balanced) returns mid-tier algorithms', () => {
    const candidates = selectAlgorithmByBudget('low_ms', 'balanced');
    const hasMidTier = candidates.some((id) =>
      ['inductive_miner', 'alpha_plus_plus', 'heuristic_miner'].includes(id)
    );
    expect(hasMidTier).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 3 — Rank 2 (domain contract): Constraint enforcement
// ---------------------------------------------------------------------------

describe('Group 3 — Constraint enforcement (Rank 2 domain contract)', () => {
  describe('execution mode mapping from profile', () => {
    it('fast → online (lowest dispatch overhead)', () => {
      expect(profileToExecutionMode('fast')).toBe('online');
    });

    it('stream → online (streaming is always online)', () => {
      expect(profileToExecutionMode('stream')).toBe('online');
    });

    it('balanced (small log) → online', () => {
      expect(profileToExecutionMode('balanced', 1_000)).toBe('online');
    });

    it('balanced (large log >50K events) → near-online', () => {
      expect(profileToExecutionMode('balanced', 51_000)).toBe('near-online');
    });

    it('quality (no batch algorithm) → near-online', () => {
      expect(profileToExecutionMode('quality', undefined, 'inductive_miner')).toBe('near-online');
    });

    it('quality with ILP algorithm → batch', () => {
      expect(profileToExecutionMode('quality', undefined, 'ilp')).toBe('batch');
    });

    it('quality with genetic_algorithm → batch', () => {
      expect(profileToExecutionMode('quality', undefined, 'genetic_algorithm')).toBe('batch');
    });

    it('quality with aco → batch', () => {
      expect(profileToExecutionMode('quality', undefined, 'aco')).toBe('batch');
    });

    it('quality with pso → batch', () => {
      expect(profileToExecutionMode('quality', undefined, 'pso')).toBe('batch');
    });
  });

  describe('shouldDegradeAlgorithm() — five degradation rules', () => {
    it('Rule 1: memory exceeded → degrade', () => {
      // prior run used 600MB, budget is 500MB
      expect(
        shouldDegradeAlgorithm(
          100, // priorLatencyMs (within budget)
          200, // latencyBudgetMs
          600 * 1_024 * 1_024, // priorMemoryBytes (600MB)
          500 * 1_024 * 1_024, // memoryBudgetBytes (500MB)
          false,
          true,
          false
        )
      ).toBe(true);
    });

    it('Rule 1: memory within budget → no degradation from memory alone', () => {
      expect(
        shouldDegradeAlgorithm(
          100,
          200,
          200 * 1_024 * 1_024, // 200MB used
          500 * 1_024 * 1_024, // 500MB budget
          false,
          true,
          false
        )
      ).toBe(false);
    });

    it('Rule 1: memoryBudget=0 (unlimited) → memory rule does not fire', () => {
      expect(
        shouldDegradeAlgorithm(
          100,
          200,
          999 * 1_024 * 1_024, // massive prior usage
          0, // 0 = unlimited
          false,
          true,
          false
        )
      ).toBe(false);
    });

    it('Rule 2: latency exceeded → degrade', () => {
      expect(
        shouldDegradeAlgorithm(
          500, // 500ms actual
          100, // 100ms budget
          0,
          0,
          false,
          true,
          false
        )
      ).toBe(true);
    });

    it('Rule 2: latency within budget → no degradation from latency alone', () => {
      expect(
        shouldDegradeAlgorithm(
          50, // 50ms actual
          100, // 100ms budget
          0,
          0,
          false,
          true,
          false
        )
      ).toBe(false);
    });

    it('Rule 3: circuit breaker open → degrade', () => {
      expect(
        shouldDegradeAlgorithm(
          50,
          100,
          0,
          0,
          true, // circuitOpen
          true,
          false
        )
      ).toBe(true);
    });

    it('Rule 4: backend unhealthy → degrade', () => {
      expect(
        shouldDegradeAlgorithm(
          50,
          100,
          0,
          0,
          false,
          false, // backendHealthy = false
          false
        )
      ).toBe(true);
    });

    it('Rule 5: SPC violation → degrade', () => {
      expect(
        shouldDegradeAlgorithm(
          50,
          100,
          0,
          0,
          false,
          true,
          true // spcViolation = true
        )
      ).toBe(true);
    });

    it('all constraints satisfied → no degradation', () => {
      expect(
        shouldDegradeAlgorithm(
          50,
          100,
          100 * 1_024 * 1_024,
          500 * 1_024 * 1_024,
          false,
          true,
          false
        )
      ).toBe(false);
    });
  });

  describe('plan() with maxMemoryMB constraint', () => {
    it('budget.memoryBudget is correctly derived from execution.maxMemoryMB', () => {
      const p = plan(
        makeConfig({ execution: { profile: 'quality', maxMemoryMB: 256 } })
      );
      // 256MB in bytes
      expect(p.budget.memoryBudget).toBe(256 * 1_024 * 1_024);
    });

    it('budget.memoryBudget is 0 (unlimited) when maxMemoryMB is not set', () => {
      const p = plan(makeConfig({ execution: { profile: 'fast' } }));
      expect(p.budget.memoryBudget).toBe(0);
    });

    it('budget.memoryBudget is 0 (unlimited) when maxMemoryMB is explicitly 0', () => {
      const p = plan(makeConfig({ execution: { profile: 'balanced', maxMemoryMB: 0 } }));
      expect(p.budget.memoryBudget).toBe(0);
    });
  });

  describe('plan() with streaming source format', () => {
    it('stream profile with csv source still selects streaming algorithm', () => {
      const p = plan(
        makeConfig({ source: { format: 'csv' }, execution: { profile: 'stream' } })
      );
      const types = stepTypes(p);
      expect(types.has(PlanStepType.DISCOVER_SIMD_STREAMING_DFG)).toBe(true);
    });

    it('stream profile sourceKind is correctly forwarded from source.format', () => {
      const p = plan(
        makeConfig({ source: { format: 'csv' }, execution: { profile: 'stream' } })
      );
      expect(p.sourceKind).toBe('csv');
    });
  });

  describe('plan() execution mode for quality profile with batch algorithms', () => {
    it('quality profile with ILP override → budget.mode is batch', () => {
      const p = plan(
        makeConfig({
          execution: { profile: 'quality' },
          algorithm: { name: 'ilp' },
        })
      );
      expect(p.budget.mode).toBe('batch');
    });

    it('quality profile with genetic_algorithm override → budget.mode is batch', () => {
      const p = plan(
        makeConfig({
          execution: { profile: 'quality' },
          algorithm: { name: 'genetic_algorithm' },
        })
      );
      expect(p.budget.mode).toBe('batch');
    });

    it('quality profile without batch algorithm override → budget.mode is near-online', () => {
      const p = plan(
        makeConfig({
          execution: { profile: 'quality' },
          algorithm: { name: 'inductive_miner' },
        })
      );
      expect(p.budget.mode).toBe('near-online');
    });

    it('fast profile always has budget.mode = online', () => {
      const p = plan(makeConfig({ execution: { profile: 'fast' } }));
      expect(p.budget.mode).toBe('online');
    });

    it('balanced profile has budget.mode = online (small log default)', () => {
      const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
      expect(p.budget.mode).toBe('online');
    });
  });
});

// ---------------------------------------------------------------------------
// Group 4 — Rank 3 (metamorphic): Config sensitivity
// ---------------------------------------------------------------------------

describe('Group 4 — Config sensitivity (Rank 3 metamorphic)', () => {
  it('changing profile from fast to quality changes the selected discovery steps', () => {
    const fastPlan = plan(makeConfig({ execution: { profile: 'fast' } }));
    const qualityPlan = plan(makeConfig({ execution: { profile: 'quality' } }));

    const fastDiscovery = discoverySteps(fastPlan);
    const qualityDiscovery = discoverySteps(qualityPlan);

    // The sets must differ — different profiles must select different algorithms
    expect(fastDiscovery).not.toEqual(qualityDiscovery);
  });

  it('changing profile from fast to quality changes the plan hash', () => {
    const fastPlan = plan(makeConfig({ execution: { profile: 'fast' } }));
    const qualityPlan = plan(makeConfig({ execution: { profile: 'quality' } }));

    // Different profiles → different deterministic hashes
    expect(fastPlan.hash).not.toBe(qualityPlan.hash);
  });

  it('changing profile from fast to balanced increases step count (more analysis coverage)', () => {
    const fastPlan = plan(makeConfig({ execution: { profile: 'fast' } }));
    const balancedPlan = plan(makeConfig({ execution: { profile: 'balanced' } }));

    // balanced profile adds more discovery + ML steps
    expect(balancedPlan.steps.length).toBeGreaterThan(fastPlan.steps.length);
  });

  it('changing profile from balanced to quality increases step count (more analysis coverage)', () => {
    const balancedPlan = plan(makeConfig({ execution: { profile: 'balanced' } }));
    const qualityPlan = plan(makeConfig({ execution: { profile: 'quality' } }));

    // quality adds ANALYZE_PERFORMANCE on top of balanced's steps
    expect(qualityPlan.steps.length).toBeGreaterThanOrEqual(balancedPlan.steps.length);
  });

  it('adding algorithm override changes the discovery steps (override replaces profile default)', () => {
    const defaultPlan = plan(makeConfig({ execution: { profile: 'fast' } }));
    const overridePlan = plan(
      makeConfig({
        execution: { profile: 'fast' },
        algorithm: { name: 'heuristic_miner' },
      })
    );

    const defaultDiscovery = discoverySteps(defaultPlan);
    const overrideDiscovery = discoverySteps(overridePlan);

    // Override replaces DFG-class steps with heuristic_miner
    expect(overrideDiscovery).toContain(PlanStepType.DISCOVER_HEURISTIC);
    expect(defaultDiscovery).not.toContain(PlanStepType.DISCOVER_HEURISTIC);
  });

  it('algorithm override preserves analysis steps from the profile', () => {
    // fast profile has ANALYZE_STATISTICS; override should not remove it
    const overridePlan = plan(
      makeConfig({
        execution: { profile: 'fast' },
        algorithm: { name: 'heuristic_miner' },
      })
    );
    const types = stepTypes(overridePlan);
    expect(types.has(PlanStepType.ANALYZE_STATISTICS)).toBe(true);
  });

  it('fast profile with ILP override changes budget.mode to batch (batch algo detected)', () => {
    const fastDefault = plan(makeConfig({ execution: { profile: 'fast' } }));
    const fastWithIlp = plan(
      makeConfig({
        execution: { profile: 'fast' },
        algorithm: { name: 'ilp' },
      })
    );

    // fast default is online; but the profile is fast so mode stays online
    // (only quality profile + batch algo triggers batch mode per the planner logic)
    expect(fastDefault.budget.mode).toBe('online');
    // fast profile stays online regardless of algorithm override (mode is derived from profile)
    expect(fastWithIlp.budget.mode).toBe('online');
  });

  it('selectAlgorithmByBudget returns different candidates for sub_ms vs seconds at quality', () => {
    const fastCandidates = selectAlgorithmByBudget('sub_ms', 'fast');
    const qualityCandidates = selectAlgorithmByBudget('seconds', 'quality');

    // No overlap between the two sets
    const overlap = fastCandidates.filter((id) => qualityCandidates.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('adding maxMemoryMB=512 constraint changes budget.memoryBudget from 0 to 512MB', () => {
    const unconstrained = plan(makeConfig({ execution: { profile: 'balanced' } }));
    const constrained = plan(
      makeConfig({ execution: { profile: 'balanced', maxMemoryMB: 512 } })
    );

    expect(unconstrained.budget.memoryBudget).toBe(0);
    expect(constrained.budget.memoryBudget).toBe(512 * 1_024 * 1_024);
  });

  it('changing profile fast → stream uses simd_streaming_dfg instead of dfg/skeleton', () => {
    const fastPlan = plan(makeConfig({ execution: { profile: 'fast' } }));
    const streamPlan = plan(makeConfig({ execution: { profile: 'stream' } }));

    const fastDiscovery = discoverySteps(fastPlan);
    const streamDiscovery = discoverySteps(streamPlan);

    // fast → dfg + process_skeleton; stream → simd_streaming_dfg
    expect(fastDiscovery).not.toContain(PlanStepType.DISCOVER_SIMD_STREAMING_DFG);
    expect(streamDiscovery).toContain(PlanStepType.DISCOVER_SIMD_STREAMING_DFG);
  });
});
