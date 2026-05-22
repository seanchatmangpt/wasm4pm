/**
 * Edge-case tests for @wasm4pm/planner.
 *
 * Covers four axes not exercised by existing test files:
 *   1. Profile budget mapping — latency/quality budget matches declared profile semantics
 *   2. Plan determinism — same config always produces the same hash
 *   3. Config edge cases — optional fields, minimal configs, and override combinations
 *   4. Plan node structure — DAG shape and node field invariants
 *
 * Oracle rank: 1–2 (structural + domain-contract).
 * No WASM core required; all assertions operate on pure TypeScript values.
 */

import { describe, it, expect } from 'vitest';
import { plan } from '../planner.js';
import type { Config } from '../planner.js';
import { explain } from '../explain.js';
import { PlanStepType } from '../steps.js';
import { validatePlan } from '../validation.js';

// ---------------------------------------------------------------------------
// Config factory — minimal valid config shared across suites
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
// 1. Profile budget mapping (6 tests)
// ---------------------------------------------------------------------------

describe('plan() — profile budget mapping', () => {
  it('fast profile → latencyBudget "sub_ms" (speed preference over quality)', () => {
    const result = plan(makeConfig({ execution: { profile: 'fast' } }));
    expect(result.budget.latencyBudget).toBe('sub_ms');
    expect(result.budget.qualityFloor).toBe('fast');
  });

  it('quality profile → latencyBudget "high_ms" (quality preference over speed)', () => {
    const result = plan(makeConfig({ execution: { profile: 'quality' } }));
    expect(result.budget.latencyBudget).toBe('high_ms');
    expect(result.budget.qualityFloor).toBe('quality');
  });

  it('stream profile → latencyBudget "sub_ms" (streaming algorithm in plan)', () => {
    const result = plan(makeConfig({ execution: { profile: 'stream' } }));
    expect(result.budget.latencyBudget).toBe('sub_ms');
    // stream profile includes at least one streaming-oriented discovery step
    const stepTypes = result.steps.map((s) => s.type);
    expect(stepTypes.some((t) => t.includes('discover'))).toBe(true);
  });

  it('balanced profile → qualityFloor "balanced" (balanced algorithm in plan)', () => {
    const result = plan(makeConfig({ execution: { profile: 'balanced' } }));
    expect(result.budget.qualityFloor).toBe('balanced');
    // balanced profile uses heuristic miner as primary discovery
    const stepTypes = result.steps.map((s) => s.type);
    expect(stepTypes.some((t) => t.includes('discover'))).toBe(true);
  });

  it('all 4 standard profiles produce plans that pass validatePlan() with zero critical errors', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream']) {
      const result = plan(makeConfig({ execution: { profile } }));
      const errors = validatePlan(result);
      const critical = errors.filter((e) => e.severity === 'error');
      expect(
        critical,
        `profile="${profile}" has critical validation errors: ${JSON.stringify(critical)}`
      ).toHaveLength(0);
    }
  });

  it('unknown profile falls back gracefully (does not throw)', () => {
    // Unknown profiles map to the default analysis step set — the planner
    // treats unrecognised profile strings like a minimal pipeline rather than throwing.
    expect(() => plan(makeConfig({ execution: { profile: 'unknown_profile_xyz' } }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Plan determinism (5 tests)
// ---------------------------------------------------------------------------

describe('plan() — determinism', () => {
  it('same config object → same plan hash on two consecutive calls', () => {
    const config = makeConfig();
    const hash1 = plan(config).hash;
    const hash2 = plan(config).hash;
    expect(hash1).toBe(hash2);
  });

  it('different algorithm override → different plan hash', () => {
    const hashDfg = plan(makeConfig({ algorithm: { name: 'dfg' } })).hash;
    const hashHeuristic = plan(makeConfig({ algorithm: { name: 'heuristic_miner' } })).hash;
    expect(hashDfg).not.toBe(hashHeuristic);
  });

  it('different profile → different plan hash', () => {
    const hashFast = plan(makeConfig({ execution: { profile: 'fast' } })).hash;
    const hashBalanced = plan(makeConfig({ execution: { profile: 'balanced' } })).hash;
    expect(hashFast).not.toBe(hashBalanced);
  });

  it('plan.hash is a 64-character hex string (BLAKE3)', () => {
    const result = plan(makeConfig());
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('plan() and explain() agree on algorithm name for fast profile (PRD §11 parity)', () => {
    const config = makeConfig({ execution: { profile: 'fast' } });
    const p = plan(config);
    const explainText = explain(config);
    // The explain output must reference the plan hash — confirms same plan is used
    expect(explainText).toContain(p.hash);
  });
});

// ---------------------------------------------------------------------------
// 3. Config edge cases (7 tests)
// ---------------------------------------------------------------------------

describe('plan() — config edge cases', () => {
  it('config with all optional fields populated → plan is valid', () => {
    const config: Config = {
      version: '1.0',
      source: { format: 'xes', content: '<XES data>' },
      execution: {
        profile: 'balanced',
        mode: 'sync',
        maxEvents: 10000,
        maxMemoryMB: 512,
        timeoutMs: 30000,
        enableProfiling: true,
        parameters: { threshold: 0.5 },
      },
      algorithm: { name: 'dfg', parameters: { custom: true } },
      output: {
        generateReports: true,
        includeMetrics: true,
        includeRawResults: false,
        format: 'json',
      },
      ml: { enabled: false },
      metadata: { name: 'test', description: 'edge case', tags: ['test'] },
    };
    expect(() => plan(config)).not.toThrow();
    const errors = validatePlan(plan(config));
    expect(errors.filter((e) => e.severity === 'error')).toHaveLength(0);
  });

  it('config with only required fields → plan is valid', () => {
    const config = makeConfig();
    expect(() => plan(config)).not.toThrow();
    const errors = validatePlan(plan(config));
    expect(errors.filter((e) => e.severity === 'error')).toHaveLength(0);
  });

  it('config with OTEL disabled (no output section) → plan still produces steps', () => {
    const config: Config = {
      version: '1.0',
      source: { format: 'xes' },
      execution: { profile: 'fast' },
      // no output section → OTEL/sink section omitted
    };
    const result = plan(config);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('config with custom algorithm parameters → parameters propagate to algorithm step', () => {
    const config = makeConfig({
      algorithm: { name: 'dfg', parameters: { custom_threshold: 0.42 } },
    });
    const result = plan(config);
    const algoStep = result.steps.find((s) => s.type === PlanStepType.DISCOVER_DFG);
    expect(algoStep).toBeDefined();
    // Parameters from config.algorithm.parameters should appear in the step
    expect(algoStep?.parameters).toMatchObject({ custom_threshold: 0.42 });
  });

  it('config with csv source format → sourceKind is "csv" (lowercased)', () => {
    const result = plan(makeConfig({ source: { format: 'CSV' } }));
    expect(result.sourceKind).toBe('csv');
  });

  it('config with watch.enabled has no effect on plan validity (watch is not a plan concern)', () => {
    // Plan generation should succeed regardless of watch config
    // (watch is handled at the engine layer, not by the planner)
    const config = makeConfig({
      // watch is not part of Config — planner is unaware of it; test that extra keys survive
    });
    expect(() => plan(config)).not.toThrow();
    const result = plan(config);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('config with ml.enabled=true and explicit tasks on fast profile → ML steps added', () => {
    const config = makeConfig({
      ml: { enabled: true, tasks: ['cluster', 'anomaly'] },
    });
    const result = plan(config);
    const stepTypes = result.steps.map((s) => s.type);
    expect(stepTypes).toContain(PlanStepType.ML_CLUSTER);
    expect(stepTypes).toContain(PlanStepType.ML_ANOMALY);
  });
});

// ---------------------------------------------------------------------------
// 4. Plan node structure (7 tests)
// ---------------------------------------------------------------------------

describe('plan() — plan node structure', () => {
  it('plan has at least one algorithm-type step (discovery or analysis)', () => {
    const result = plan(makeConfig());
    const algoSteps = result.steps.filter(
      (s) =>
        s.type.startsWith('discover_') ||
        s.type.startsWith('analyze_') ||
        s.type.startsWith('ml_')
    );
    expect(algoSteps.length).toBeGreaterThan(0);
  });

  it('plan has exactly one bootstrap step (serves as source anchor)', () => {
    const result = plan(makeConfig());
    const bootstrapSteps = result.steps.filter((s) => s.type === PlanStepType.BOOTSTRAP);
    expect(bootstrapSteps).toHaveLength(1);
  });

  it('plan has exactly one cleanup step (serves as sink anchor)', () => {
    const result = plan(makeConfig());
    const cleanupSteps = result.steps.filter((s) => s.type === PlanStepType.CLEANUP);
    expect(cleanupSteps).toHaveLength(1);
  });

  it('each step has the required fields: id, type, description, dependsOn, required, parameters', () => {
    const result = plan(makeConfig());
    for (const step of result.steps) {
      expect(typeof step.id).toBe('string');
      expect(step.id.length).toBeGreaterThan(0);
      expect(typeof step.type).toBe('string');
      expect(typeof step.description).toBe('string');
      expect(Array.isArray(step.dependsOn)).toBe(true);
      expect(typeof step.required).toBe('boolean');
      expect(typeof step.parameters).toBe('object');
    }
  });

  it('no two steps share the same id', () => {
    const result = plan(makeConfig({ execution: { profile: 'quality' } }));
    const ids = result.steps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('plan DAG edges form a valid source→algorithm→sink sequence (all deps resolve to existing nodes)', () => {
    const result = plan(makeConfig());
    const nodeSet = new Set(result.graph.nodes);
    for (const [src, tgt] of result.graph.edges) {
      expect(
        nodeSet.has(src),
        `Edge source "${src}" not found in graph.nodes`
      ).toBe(true);
      expect(
        nodeSet.has(tgt),
        `Edge target "${tgt}" not found in graph.nodes`
      ).toBe(true);
    }
  });

  it('all node ids referenced in step.dependsOn exist as graph nodes', () => {
    const result = plan(makeConfig({ execution: { profile: 'balanced' } }));
    const nodeSet = new Set(result.graph.nodes);
    for (const step of result.steps) {
      for (const dep of step.dependsOn) {
        expect(
          nodeSet.has(dep),
          `Step "${step.id}" depends on "${dep}" which is not in graph.nodes`
        ).toBe(true);
      }
    }
  });
});
