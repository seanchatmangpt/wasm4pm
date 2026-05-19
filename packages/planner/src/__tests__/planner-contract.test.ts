/**
 * Rank-2 domain-contract tests for @wasm4pm/planner.
 *
 * These tests verify design-decided invariants that are provable from the
 * planner's specification without running the WASM core:
 *   - plan() returns a structurally valid ExecutionPlan
 *   - hash is deterministic (same config → same hash)
 *   - hash is sensitive to algorithm changes (different algorithm → different hash)
 *   - required lifecycle steps are always present (bootstrap, load_source, validate_source, cleanup)
 *   - plan() rejects configs that violate the contract (missing version, source, profile)
 *   - algorithm override replaces discovery steps while preserving analysis steps
 *   - budget envelope is attached and profile-appropriate
 *
 * Oracle rank: 2 (domain contract) — properties are derived from the planner
 * specification, not from the implementation under test.
 */

import { describe, it, expect } from 'vitest';
import { plan, PlannerError } from '../planner.js';
import type { Config, ExecutionPlan } from '../planner.js';
import { PlanStepType } from '../steps.js';
import { validatePlan } from '../validation.js';

// ---------------------------------------------------------------------------
// Shared minimal config factory — avoids repeating required fields.
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
// Structural validity
// ---------------------------------------------------------------------------

describe('plan() — structural validity', () => {
  it('returns an ExecutionPlan object for a minimal fast-profile config', () => {
    const result = plan(makeConfig());

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('plan has a non-empty UUID id', () => {
    const result = plan(makeConfig());
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(result.id).toMatch(uuidPattern);
  });

  it('plan has a non-empty BLAKE3 hash (64 hex chars)', () => {
    const result = plan(makeConfig());
    expect(typeof result.hash).toBe('string');
    expect(result.hash.length).toBe(64);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('plan.steps is a non-empty array', () => {
    const result = plan(makeConfig());
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('plan.graph has nodes and edges arrays', () => {
    const result = plan(makeConfig());
    expect(Array.isArray(result.graph.nodes)).toBe(true);
    expect(Array.isArray(result.graph.edges)).toBe(true);
  });

  it('plan.profile matches the config execution.profile (lowercased)', () => {
    const result = plan(makeConfig({ execution: { profile: 'balanced' } }));
    expect(result.profile).toBe('balanced');
  });

  it('plan.sourceKind matches the config source.format (lowercased)', () => {
    const result = plan(makeConfig({ source: { format: 'XES' } }));
    expect(result.sourceKind).toBe('xes');
  });

  it('passes validatePlan() with zero critical errors for all standard profiles', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream']) {
      const result = plan(makeConfig({ execution: { profile } }));
      const errors = validatePlan(result);
      const critical = errors.filter((e) => e.severity === 'error');
      expect(critical, `profile="${profile}" produced critical errors: ${JSON.stringify(critical)}`).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Required lifecycle steps
// ---------------------------------------------------------------------------

describe('plan() — required lifecycle steps', () => {
  function stepTypes(p: ExecutionPlan): string[] {
    return p.steps.map((s) => s.type);
  }

  it('always includes a bootstrap step', () => {
    const result = plan(makeConfig());
    expect(stepTypes(result)).toContain(PlanStepType.BOOTSTRAP);
  });

  it('always includes an init_wasm step', () => {
    const result = plan(makeConfig());
    expect(stepTypes(result)).toContain(PlanStepType.INIT_WASM);
  });

  it('always includes a load_source step', () => {
    const result = plan(makeConfig());
    expect(stepTypes(result)).toContain(PlanStepType.LOAD_SOURCE);
  });

  it('always includes a validate_source step', () => {
    const result = plan(makeConfig());
    expect(stepTypes(result)).toContain(PlanStepType.VALIDATE_SOURCE);
  });

  it('always includes a cleanup step', () => {
    const result = plan(makeConfig());
    expect(stepTypes(result)).toContain(PlanStepType.CLEANUP);
  });

  it('fast profile includes at least one discovery step', () => {
    const result = plan(makeConfig({ execution: { profile: 'fast' } }));
    const discoverSteps = result.steps.filter((s) => s.type.startsWith('discover_'));
    expect(discoverSteps.length).toBeGreaterThan(0);
  });

  it('quality profile includes more steps than fast profile (more analysis)', () => {
    const fast = plan(makeConfig({ execution: { profile: 'fast' } }));
    const quality = plan(makeConfig({ execution: { profile: 'quality' } }));
    expect(quality.steps.length).toBeGreaterThan(fast.steps.length);
  });

  it('balanced and quality profiles include all six ML steps', () => {
    const mlStepTypes = new Set([
      PlanStepType.ML_CLASSIFY,
      PlanStepType.ML_CLUSTER,
      PlanStepType.ML_FORECAST,
      PlanStepType.ML_ANOMALY,
      PlanStepType.ML_REGRESS,
      PlanStepType.ML_PCA,
    ]);

    for (const profile of ['balanced', 'quality']) {
      const result = plan(makeConfig({ execution: { profile } }));
      const types = new Set(result.steps.map((s) => s.type));
      for (const mlType of mlStepTypes) {
        expect(
          types.has(mlType),
          `profile="${profile}" missing ML step: ${mlType}`
        ).toBe(true);
      }
    }
  });

  it('fast profile does NOT include ML steps by default', () => {
    const result = plan(makeConfig({ execution: { profile: 'fast' } }));
    const mlTypes = result.steps.filter((s) => s.type.startsWith('ml_'));
    expect(mlTypes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Determinism — identical config → identical hash
// ---------------------------------------------------------------------------

describe('plan() — determinism (Rank-1 property)', () => {
  it('produces the same hash for two calls with the same config', () => {
    const config = makeConfig();
    const hash1 = plan(config).hash;
    const hash2 = plan(config).hash;
    expect(hash1).toBe(hash2);
  });

  it('produces the same hash for structurally equal configs built separately', () => {
    const hash1 = plan(makeConfig({ execution: { profile: 'balanced' } })).hash;
    const hash2 = plan(makeConfig({ execution: { profile: 'balanced' } })).hash;
    expect(hash1).toBe(hash2);
  });

  it('produces different plan IDs on each call (UUID uniqueness)', () => {
    const config = makeConfig();
    const id1 = plan(config).id;
    const id2 = plan(config).id;
    // IDs are UUIDs and must be unique across calls
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// Hash sensitivity — algorithm change → hash change
// ---------------------------------------------------------------------------

describe('plan() — hash sensitivity to algorithm', () => {
  it('hash differs when algorithm override changes from dfg to ilp', () => {
    const hashDfg = plan(
      makeConfig({ algorithm: { name: 'dfg' } })
    ).hash;
    const hashIlp = plan(
      makeConfig({ algorithm: { name: 'ilp' } })
    ).hash;
    expect(hashDfg).not.toBe(hashIlp);
  });

  it('hash differs when profile changes from fast to quality', () => {
    const hashFast = plan(makeConfig({ execution: { profile: 'fast' } })).hash;
    const hashQuality = plan(makeConfig({ execution: { profile: 'quality' } })).hash;
    expect(hashFast).not.toBe(hashQuality);
  });

  it('hash differs when source format changes from xes to csv', () => {
    const hashXes = plan(makeConfig({ source: { format: 'xes' } })).hash;
    const hashCsv = plan(makeConfig({ source: { format: 'csv' } })).hash;
    expect(hashXes).not.toBe(hashCsv);
  });
});

// ---------------------------------------------------------------------------
// Algorithm override
// ---------------------------------------------------------------------------

describe('plan() — algorithm override', () => {
  it('replaces default discovery steps with the single overridden algorithm', () => {
    const result = plan(
      makeConfig({ algorithm: { name: 'ilp' } })
    );
    const discoverSteps = result.steps.filter((s) => s.type.startsWith('discover_'));
    // ILP maps to discover_ilp; only that discovery step should be present
    expect(discoverSteps).toHaveLength(1);
    expect(discoverSteps[0].type).toBe(PlanStepType.DISCOVER_ILP);
  });

  it('preserves analysis steps when algorithm is overridden', () => {
    const result = plan(
      makeConfig({ algorithm: { name: 'dfg' } })
    );
    const analysisSteps = result.steps.filter((s) => s.type === PlanStepType.ANALYZE_STATISTICS);
    expect(analysisSteps.length).toBeGreaterThan(0);
  });

  it('throws PlannerError for unknown algorithm name', () => {
    expect(() =>
      plan(makeConfig({ algorithm: { name: 'not_a_real_algorithm' } }))
    ).toThrow(PlannerError);
  });
});

// ---------------------------------------------------------------------------
// Config validation — contract enforcement at plan() boundary
// ---------------------------------------------------------------------------

describe('plan() — config validation', () => {
  it('throws PlannerError when config is null', () => {
    expect(() => plan(null as unknown as Config)).toThrow(PlannerError);
  });

  it('throws PlannerError when version is missing', () => {
    expect(() =>
      plan({ source: { format: 'xes' }, execution: { profile: 'fast' } } as unknown as Config)
    ).toThrow(PlannerError);
  });

  it('throws PlannerError when version is not "1.0"', () => {
    expect(() =>
      plan({ version: '2.0', source: { format: 'xes' }, execution: { profile: 'fast' } } as unknown as Config)
    ).toThrow(PlannerError);
  });

  it('throws PlannerError when source.format is missing', () => {
    expect(() =>
      plan({ version: '1.0', source: {} as { format: string }, execution: { profile: 'fast' } })
    ).toThrow(PlannerError);
  });

  it('throws PlannerError when execution.profile is missing', () => {
    expect(() =>
      plan({ version: '1.0', source: { format: 'xes' }, execution: {} as { profile: string } })
    ).toThrow(PlannerError);
  });
});

// ---------------------------------------------------------------------------
// Budget envelope (Section 4.1 contract)
// ---------------------------------------------------------------------------

describe('plan() — budget envelope', () => {
  it('attaches a budget envelope to every plan', () => {
    const result = plan(makeConfig());
    expect(result.budget).toBeDefined();
  });

  it('fast profile → latencyBudget is "sub_ms"', () => {
    const result = plan(makeConfig({ execution: { profile: 'fast' } }));
    expect(result.budget.latencyBudget).toBe('sub_ms');
  });

  it('quality profile → latencyBudget is "high_ms"', () => {
    const result = plan(makeConfig({ execution: { profile: 'quality' } }));
    expect(result.budget.latencyBudget).toBe('high_ms');
  });

  it('balanced profile → qualityFloor is "balanced"', () => {
    const result = plan(makeConfig({ execution: { profile: 'balanced' } }));
    expect(result.budget.qualityFloor).toBe('balanced');
  });

  it('quality profile → qualityFloor is "quality"', () => {
    const result = plan(makeConfig({ execution: { profile: 'quality' } }));
    expect(result.budget.qualityFloor).toBe('quality');
  });
});

// ---------------------------------------------------------------------------
// DAG structural correctness
// ---------------------------------------------------------------------------

describe('plan() — DAG structural correctness', () => {
  it('graph.nodes count equals steps.length', () => {
    const result = plan(makeConfig());
    expect(result.graph.nodes.length).toBe(result.steps.length);
  });

  it('every step.id appears in graph.nodes', () => {
    const result = plan(makeConfig());
    const nodeSet = new Set(result.graph.nodes);
    for (const step of result.steps) {
      expect(nodeSet.has(step.id), `step.id "${step.id}" not in graph.nodes`).toBe(true);
    }
  });

  it('cleanup step declares all other steps as dependencies', () => {
    const result = plan(makeConfig());
    const cleanup = result.steps.find((s) => s.type === PlanStepType.CLEANUP);
    expect(cleanup).toBeDefined();
    const otherIds = result.steps
      .filter((s) => s.type !== PlanStepType.CLEANUP)
      .map((s) => s.id);
    for (const id of otherIds) {
      expect(
        cleanup!.dependsOn,
        `cleanup should depend on "${id}"`
      ).toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// Explicit ML opt-in via config.ml
// ---------------------------------------------------------------------------

describe('plan() — explicit ML opt-in (config.ml)', () => {
  it('adds requested ML step even on fast profile when ml.enabled is true', () => {
    const result = plan(
      makeConfig({
        ml: { enabled: true, tasks: ['cluster'] },
      })
    );
    const types = result.steps.map((s) => s.type);
    expect(types).toContain(PlanStepType.ML_CLUSTER);
  });

  it('does not duplicate ML steps when profile already includes them', () => {
    const result = plan(
      makeConfig({
        execution: { profile: 'balanced' },
        ml: { enabled: true, tasks: ['cluster'] },
      })
    );
    const clusterSteps = result.steps.filter((s) => s.type === PlanStepType.ML_CLUSTER);
    // Map guarantees deduplication: exactly one cluster step
    expect(clusterSteps).toHaveLength(1);
  });
});
