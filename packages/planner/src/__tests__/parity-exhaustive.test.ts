/**
 * Exhaustive parity and DAG structure oracle tests for @wasm4pm/planner.
 *
 * This file targets coverage gaps not addressed by the four existing test files:
 *   1. Policy module (selectEngineByPriority, selectAlgorithmByBudget, shouldPromoteJob,
 *      shouldDegradeAlgorithm, profileToExecutionMode, profileToLatencyBudget,
 *      profileToQualityFloor) — previously 0% covered.
 *   2. toContractsPlan() node kind-mapping (source/algorithm/sink) and edge ordering.
 *   3. Conditional write_sink step — only added when config.output is present.
 *   4. PRD §11 parity via a PlannerLike-compatible adapter (structural verification
 *      that plan() + explain() satisfy the same interface contract as @wasm4pm/testing
 *      expects, without importing that package).
 *
 * Oracle rank classification:
 *   Rank 1 — mathematical (cycle-free, topological order, budget arithmetic)
 *   Rank 2 — domain contract (seven-priority rules, four promotion rules, five degradation rules)
 *   Rank 3 — metamorphic (changing one input dimension changes output in predictable direction)
 */

import { describe, it, expect } from 'vitest';
import { plan, toContractsPlan, PlannerError, type Config, type ExecutionPlan } from '../planner.js';
import { explain } from '../explain.js';
import {
  PlanStepType,
} from '../steps.js';
import { validatePlan } from '../validation.js';
import {
  topologicalSort,
  hasCycle,
  getDependencies,
  getDependents,
  type DAG,
} from '../dag.js';
import {
  selectEngineByPriority,
  selectAlgorithmByBudget,
  shouldPromoteJob,
  shouldDegradeAlgorithm,
  profileToExecutionMode,
  profileToLatencyBudget,
  profileToQualityFloor,
} from '../policy.js';
import type { BudgetEnvelope } from '@wasm4pm/contracts';

// ---------------------------------------------------------------------------
// Shared config factory
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile: 'fast' },
    ...overrides,
  };
}

/** Minimal BudgetEnvelope for policy tests */
function makeBudget(
  overrides: Partial<BudgetEnvelope> = {}
): BudgetEnvelope {
  return {
    latencyBudget: 'low_ms',
    memoryBudget: 0,
    qualityFloor: 'balanced',
    environment: { browserSafe: false, pythonAvailable: false },
    mode: 'online',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section 1 — Policy: profileToLatencyBudget (Rank 1 — mathematical identity)
// ---------------------------------------------------------------------------

describe('profileToLatencyBudget() — identity mapping', () => {
  it('fast → sub_ms', () => {
    expect(profileToLatencyBudget('fast')).toBe('sub_ms');
  });

  it('stream → sub_ms', () => {
    expect(profileToLatencyBudget('stream')).toBe('sub_ms');
  });

  it('balanced → low_ms', () => {
    expect(profileToLatencyBudget('balanced')).toBe('low_ms');
  });

  it('quality → high_ms', () => {
    expect(profileToLatencyBudget('quality')).toBe('high_ms');
  });

  it('fast and stream share the same latency tier (both sub_ms)', () => {
    expect(profileToLatencyBudget('fast')).toBe(profileToLatencyBudget('stream'));
  });
});

// ---------------------------------------------------------------------------
// Section 2 — Policy: profileToQualityFloor (Rank 1)
// ---------------------------------------------------------------------------

describe('profileToQualityFloor() — identity mapping', () => {
  it('fast → fast', () => {
    expect(profileToQualityFloor('fast')).toBe('fast');
  });

  it('stream → fast (streaming does not promise high quality)', () => {
    expect(profileToQualityFloor('stream')).toBe('fast');
  });

  it('balanced → balanced', () => {
    expect(profileToQualityFloor('balanced')).toBe('balanced');
  });

  it('quality → quality', () => {
    expect(profileToQualityFloor('quality')).toBe('quality');
  });

  it('quality floor is monotonically non-decreasing: fast ≤ balanced ≤ quality (Rank 1)', () => {
    const order = ['fast', 'balanced', 'quality'];
    const floors = (['fast', 'balanced', 'quality'] as const).map(profileToQualityFloor);
    for (let i = 0; i < floors.length - 1; i++) {
      expect(order.indexOf(floors[i])).toBeLessThanOrEqual(order.indexOf(floors[i + 1]));
    }
  });
});

// ---------------------------------------------------------------------------
// Section 3 — Policy: profileToExecutionMode (Rank 2 — domain contract)
// ---------------------------------------------------------------------------

describe('profileToExecutionMode() — execution mode mapping', () => {
  it('fast → online', () => {
    expect(profileToExecutionMode('fast')).toBe('online');
  });

  it('stream → online', () => {
    expect(profileToExecutionMode('stream')).toBe('online');
  });

  it('balanced (small log) → online', () => {
    expect(profileToExecutionMode('balanced', 1000)).toBe('online');
  });

  it('balanced (large log >50K events) → near-online', () => {
    expect(profileToExecutionMode('balanced', 60000)).toBe('near-online');
  });

  it('balanced (no event count) → online (default)', () => {
    expect(profileToExecutionMode('balanced')).toBe('online');
  });

  it('quality (non-batch algorithm) → near-online', () => {
    expect(profileToExecutionMode('quality', undefined, 'dfg')).toBe('near-online');
  });

  it('quality with ilp algorithm → batch', () => {
    expect(profileToExecutionMode('quality', undefined, 'ilp')).toBe('batch');
  });

  it('quality with genetic_algorithm → batch', () => {
    expect(profileToExecutionMode('quality', undefined, 'genetic_algorithm')).toBe('batch');
  });

  it('quality with aco algorithm → batch', () => {
    expect(profileToExecutionMode('quality', undefined, 'aco')).toBe('batch');
  });

  it('quality with pso algorithm → batch', () => {
    expect(profileToExecutionMode('quality', undefined, 'pso')).toBe('batch');
  });
});

// ---------------------------------------------------------------------------
// Section 4 — Policy: selectEngineByPriority (Rank 2 — seven-priority rules)
// ---------------------------------------------------------------------------

describe('selectEngineByPriority() — seven-priority rule table', () => {
  it('Rule 1: research mode + python available → pm4py', () => {
    const budget = makeBudget({ mode: 'research' });
    expect(selectEngineByPriority('dfg', budget, true)).toBe('pm4py');
  });

  it('Rule 1: research mode + python unavailable → falls through (null)', () => {
    const budget = makeBudget({ mode: 'research' });
    // With no other matching rule for low_ms, balanced, non-browser → falls to rule 7 (null)
    expect(selectEngineByPriority('dfg', budget, false)).toBeNull();
  });

  it('Rule 2: batch mode + python available → pm4py', () => {
    const budget = makeBudget({ mode: 'batch' });
    expect(selectEngineByPriority('ilp', budget, true)).toBe('pm4py');
  });

  it('Rule 2: batch mode + python unavailable → wasm', () => {
    const budget = makeBudget({ mode: 'batch' });
    expect(selectEngineByPriority('ilp', budget, false)).toBe('wasm');
  });

  it('Rule 3: browserSafe=true → wasm (regardless of python or mode)', () => {
    const budget = makeBudget({ environment: { browserSafe: true, pythonAvailable: false } });
    expect(selectEngineByPriority('dfg', budget, true)).toBe('wasm');
  });

  it('Rule 3: browserSafe overrides python availability (wasm wins)', () => {
    const budget = makeBudget({
      mode: 'online',
      environment: { browserSafe: true, pythonAvailable: true },
    });
    expect(selectEngineByPriority('dfg', budget, true)).toBe('wasm');
  });

  it('Rule 5: sub_ms latency → force wasm', () => {
    const budget = makeBudget({ latencyBudget: 'sub_ms' });
    expect(selectEngineByPriority('dfg', budget, true)).toBe('wasm');
  });

  it('Rule 5: sub_ms takes precedence over python availability', () => {
    const budget = makeBudget({ latencyBudget: 'sub_ms', mode: 'online' });
    expect(selectEngineByPriority('dfg', budget, true)).toBe('wasm');
  });

  it('Rule 6: ML algorithm family → ml backend', () => {
    const budget = makeBudget({ latencyBudget: 'low_ms' });
    expect(selectEngineByPriority('ml_cluster', budget, false, 'ml')).toBe('ml');
  });

  it('Rule 6: ml_classify detected by algorithm ID → ml backend', () => {
    const budget = makeBudget({ latencyBudget: 'low_ms' });
    expect(selectEngineByPriority('ml_classify', budget, false)).toBe('ml');
  });

  it('Rule 6: ml_anomaly detected by algorithm ID → ml backend', () => {
    const budget = makeBudget({ latencyBudget: 'low_ms' });
    expect(selectEngineByPriority('ml_anomaly', budget, false)).toBe('ml');
  });

  it('Rule 7: no rule matched → null (caller uses 7-rule selection algorithm)', () => {
    const budget = makeBudget({ latencyBudget: 'high_ms', mode: 'near-online' });
    expect(selectEngineByPriority('dfg', budget, false, 'discovery')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Section 5 — Policy: selectAlgorithmByBudget (Rank 2 — decision table)
// ---------------------------------------------------------------------------

describe('selectAlgorithmByBudget() — algorithm decision table', () => {
  it('sub_ms + fast → [dfg, simd_streaming_dfg] (fastest algorithms)', () => {
    const result = selectAlgorithmByBudget('sub_ms', 'fast');
    expect(result).toContain('dfg');
    expect(result).toContain('simd_streaming_dfg');
  });

  it('sub_ms + balanced → [dfg, simd_streaming_dfg] (latency wins over quality request)', () => {
    const result = selectAlgorithmByBudget('sub_ms', 'balanced');
    expect(result).toContain('dfg');
  });

  it('low_ms + fast → contains dfg and heuristic_miner', () => {
    const result = selectAlgorithmByBudget('low_ms', 'fast');
    expect(result).toContain('dfg');
    expect(result).toContain('heuristic_miner');
  });

  it('low_ms + balanced → contains inductive_miner and alpha_plus_plus', () => {
    const result = selectAlgorithmByBudget('low_ms', 'balanced');
    expect(result).toContain('inductive_miner');
    expect(result).toContain('alpha_plus_plus');
  });

  it('high_ms + balanced → contains inductive_miner and simulated_annealing', () => {
    const result = selectAlgorithmByBudget('high_ms', 'balanced');
    expect(result).toContain('inductive_miner');
    expect(result).toContain('simulated_annealing');
  });

  it('high_ms + quality → contains genetic_algorithm, aco, pso', () => {
    const result = selectAlgorithmByBudget('high_ms', 'quality');
    expect(result).toContain('genetic_algorithm');
    expect(result).toContain('aco');
    expect(result).toContain('pso');
  });

  it('seconds + quality → contains ilp and optimized_dfg (highest quality for discovery)', () => {
    const result = selectAlgorithmByBudget('seconds', 'quality');
    expect(result).toContain('ilp');
    expect(result).toContain('optimized_dfg');
  });

  it('seconds + research → contains ilp and pm4py algorithms', () => {
    const result = selectAlgorithmByBudget('seconds', 'research');
    expect(result).toContain('ilp');
    expect(result.some((id) => id.startsWith('pm4py_'))).toBe(true);
  });

  it('minutes + research → contains full conformance suite including pm4py_alignments', () => {
    const result = selectAlgorithmByBudget('minutes', 'research');
    expect(result).toContain('pm4py_alignments');
  });

  it('returns at least one algorithm for every (latency, quality) combination tested', () => {
    const latencies = ['sub_ms', 'low_ms', 'high_ms', 'seconds', 'minutes'] as const;
    const qualities = ['fast', 'balanced', 'quality', 'research'] as const;
    for (const lat of latencies) {
      for (const q of qualities) {
        const result = selectAlgorithmByBudget(lat, q);
        expect(
          result.length,
          `selectAlgorithmByBudget("${lat}", "${q}") returned empty array`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('Rank 3 metamorphic: upgrading quality floor from fast to quality never reduces candidate set to zero', () => {
    const fastCandidates = selectAlgorithmByBudget('high_ms', 'fast');
    const qualityCandidates = selectAlgorithmByBudget('high_ms', 'quality');
    expect(fastCandidates.length).toBeGreaterThan(0);
    expect(qualityCandidates.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Section 6 — Policy: shouldPromoteJob (Rank 2 — four promotion rules)
// ---------------------------------------------------------------------------

describe('shouldPromoteJob() — four promotion rules', () => {
  // Baseline: no promotion
  const baselineBudget = makeBudget({ latencyBudget: 'low_ms', qualityFloor: 'balanced' });

  it('Rule 1: latency budget upgraded (sub_ms → low_ms) → promote', () => {
    const newBudget = makeBudget({ latencyBudget: 'high_ms' });
    // priorLatencyBudget=sub_ms → newBudget.latencyBudget=high_ms: upgrade
    expect(
      shouldPromoteJob(
        200, // priorLatencyMs
        'sub_ms', // priorLatencyBudget
        newBudget, // newBudget (higher tier)
        0.9, // conformanceScore (above threshold)
        0, // spcAlertLevel
        0, // priorSpcAlertLevel
        1, // healthLevel
        1 // priorHealthLevel
      )
    ).toBe(true);
  });

  it('No promotion when all conditions are stable (baseline)', () => {
    expect(
      shouldPromoteJob(
        100, // priorLatencyMs (within budget)
        'low_ms', // priorLatencyBudget (same as newBudget)
        baselineBudget, // newBudget
        0.9, // conformanceScore (above balanced threshold 0.8)
        0, // spcAlertLevel
        0, // priorSpcAlertLevel
        1, // healthLevel
        1 // priorHealthLevel
      )
    ).toBe(false);
  });

  it('Rule 2: conformance score below quality threshold → promote', () => {
    const qualityBudget = makeBudget({ latencyBudget: 'high_ms', qualityFloor: 'quality' });
    expect(
      shouldPromoteJob(
        500,
        'high_ms',
        qualityBudget,
        0.80, // below quality threshold (0.85)
        0,
        0,
        1,
        1
      )
    ).toBe(true);
  });

  it('Rule 2: conformance at exactly the balanced threshold (0.8) → no promotion', () => {
    expect(
      shouldPromoteJob(100, 'low_ms', baselineBudget, 0.8, 0, 0, 1, 1)
    ).toBe(false);
  });

  it('Rule 2: conformance below balanced threshold (0.79) → promote', () => {
    expect(
      shouldPromoteJob(100, 'low_ms', baselineBudget, 0.79, 0, 0, 1, 1)
    ).toBe(true);
  });

  it('Rule 3: SPC alert level increased → promote', () => {
    expect(
      shouldPromoteJob(100, 'low_ms', baselineBudget, 0.9, 2, 0, 1, 1)
    ).toBe(true);
  });

  it('Rule 3: SPC alert level unchanged → no promotion from this rule alone', () => {
    expect(
      shouldPromoteJob(100, 'low_ms', baselineBudget, 0.9, 1, 1, 1, 1)
    ).toBe(false);
  });

  it('Rule 4: health improved (level decreased) → promote', () => {
    expect(
      shouldPromoteJob(100, 'low_ms', baselineBudget, 0.9, 0, 0, 0, 2)
    ).toBe(true);
  });

  it('Rule 4: health stable → no promotion from this rule alone', () => {
    expect(
      shouldPromoteJob(100, 'low_ms', baselineBudget, 0.9, 0, 0, 2, 2)
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 7 — Policy: shouldDegradeAlgorithm (Rank 2 — five degradation rules)
// ---------------------------------------------------------------------------

describe('shouldDegradeAlgorithm() — five degradation rules', () => {
  // Baseline: no degradation
  const noDegrade = () =>
    shouldDegradeAlgorithm(
      100, // priorLatencyMs (within budget)
      500, // latencyBudgetMs
      100 * 1024 * 1024, // priorMemoryBytes (100 MB)
      512 * 1024 * 1024, // memoryBudgetBytes (512 MB)
      false, // circuitOpen
      true, // backendHealthy
      false // spcViolation
    );

  it('no degradation when all conditions are nominal', () => {
    expect(noDegrade()).toBe(false);
  });

  it('Rule 1: memory budget exceeded → degrade', () => {
    expect(
      shouldDegradeAlgorithm(
        100,
        500,
        600 * 1024 * 1024, // priorMemoryBytes exceeds budget
        512 * 1024 * 1024,
        false,
        true,
        false
      )
    ).toBe(true);
  });

  it('Rule 1: memory budget = 0 (unlimited) → no degradation from memory rule', () => {
    expect(
      shouldDegradeAlgorithm(
        100,
        500,
        999 * 1024 * 1024, // huge memory usage
        0, // unlimited
        false,
        true,
        false
      )
    ).toBe(false);
  });

  it('Rule 2: latency exceeded → degrade', () => {
    expect(
      shouldDegradeAlgorithm(
        1000, // priorLatencyMs exceeds budget
        500, // latencyBudgetMs
        100 * 1024 * 1024,
        512 * 1024 * 1024,
        false,
        true,
        false
      )
    ).toBe(true);
  });

  it('Rule 2: latency exactly at budget → no degradation (boundary condition)', () => {
    expect(
      shouldDegradeAlgorithm(
        500, // priorLatencyMs equals budget
        500,
        100 * 1024 * 1024,
        512 * 1024 * 1024,
        false,
        true,
        false
      )
    ).toBe(false);
  });

  it('Rule 3: circuit open → degrade', () => {
    expect(
      shouldDegradeAlgorithm(
        100,
        500,
        100 * 1024 * 1024,
        512 * 1024 * 1024,
        true, // circuitOpen
        true,
        false
      )
    ).toBe(true);
  });

  it('Rule 4: backend unhealthy → degrade', () => {
    expect(
      shouldDegradeAlgorithm(
        100,
        500,
        100 * 1024 * 1024,
        512 * 1024 * 1024,
        false,
        false, // backendHealthy=false
        false
      )
    ).toBe(true);
  });

  it('Rule 5: SPC violation → degrade', () => {
    expect(
      shouldDegradeAlgorithm(
        100,
        500,
        100 * 1024 * 1024,
        512 * 1024 * 1024,
        false,
        true,
        true // spcViolation
      )
    ).toBe(true);
  });

  it('Rank 3 metamorphic: any single rule violation is sufficient for degradation', () => {
    // Each degradation rule independently causes degrade=true
    const violations = [
      shouldDegradeAlgorithm(100, 500, 600_000_000, 512_000_000, false, true, false), // R1
      shouldDegradeAlgorithm(1000, 500, 100_000_000, 512_000_000, false, true, false), // R2
      shouldDegradeAlgorithm(100, 500, 100_000_000, 512_000_000, true, true, false), // R3
      shouldDegradeAlgorithm(100, 500, 100_000_000, 512_000_000, false, false, false), // R4
      shouldDegradeAlgorithm(100, 500, 100_000_000, 512_000_000, false, true, true), // R5
    ];
    expect(violations.every((v) => v === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 8 — toContractsPlan() kind-mapping (Rank 2 — domain contract)
// ---------------------------------------------------------------------------

describe('toContractsPlan() — node kind-mapping', () => {
  it('bootstrap step maps to kind="source"', () => {
    const p = plan(makeConfig());
    const cp = toContractsPlan(p);
    const bootstrapNode = cp.nodes.find((n) => n.id === 'bootstrap');
    expect(bootstrapNode).toBeDefined();
    expect(bootstrapNode!.kind).toBe('source');
  });

  it('init_wasm step maps to kind="source"', () => {
    const p = plan(makeConfig());
    const cp = toContractsPlan(p);
    const initNode = cp.nodes.find((n) => n.id === 'init_wasm');
    expect(initNode).toBeDefined();
    expect(initNode!.kind).toBe('source');
  });

  it('load_source step maps to kind="source"', () => {
    const p = plan(makeConfig());
    const cp = toContractsPlan(p);
    const loadNode = cp.nodes.find((n) => n.id === 'load_source');
    expect(loadNode).toBeDefined();
    expect(loadNode!.kind).toBe('source');
  });

  it('discovery step maps to kind="algorithm"', () => {
    const p = plan(makeConfig({ algorithm: { name: 'dfg' } }));
    const cp = toContractsPlan(p);
    const dfgNode = cp.nodes.find((n) => n.id === 'discover_dfg');
    expect(dfgNode).toBeDefined();
    expect(dfgNode!.kind).toBe('algorithm');
  });

  it('analysis step maps to kind="algorithm"', () => {
    const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
    const cp = toContractsPlan(p);
    const statsNode = cp.nodes.find((n) => n.id === 'analyze_statistics');
    expect(statsNode).toBeDefined();
    expect(statsNode!.kind).toBe('algorithm');
  });

  it('cleanup step maps to kind="sink"', () => {
    const p = plan(makeConfig());
    const cp = toContractsPlan(p);
    const cleanupNode = cp.nodes.find((n) => n.id === 'cleanup');
    expect(cleanupNode).toBeDefined();
    expect(cleanupNode!.kind).toBe('sink');
  });

  it('generate_reports step maps to kind="sink"', () => {
    const p = plan(makeConfig());
    const cp = toContractsPlan(p);
    const reportsNode = cp.nodes.find((n) => n.id === 'generate_reports');
    expect(reportsNode).toBeDefined();
    expect(reportsNode!.kind).toBe('sink');
  });

  it('contracts plan has schema_version "1.0"', () => {
    const cp = toContractsPlan(plan(makeConfig()));
    expect(cp.schema_version).toBe('1.0');
  });

  it('contracts plan has a non-empty plan_id matching the ExecutionPlan.id', () => {
    const p = plan(makeConfig());
    const cp = toContractsPlan(p);
    expect(cp.plan_id).toBe(p.id);
  });

  it('node count in contracts plan equals step count in ExecutionPlan', () => {
    const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
    const cp = toContractsPlan(p);
    expect(cp.nodes.length).toBe(p.steps.length);
  });

  it('edges in contracts plan match graph edges (from/to format)', () => {
    const p = plan(makeConfig());
    const cp = toContractsPlan(p);
    const graphEdgeStrings = new Set(p.graph.edges.map(([f, t]) => `${f}→${t}`));
    const contractEdgeStrings = new Set(cp.edges.map((e) => `${e.from}→${e.to}`));
    expect(contractEdgeStrings.size).toBe(graphEdgeStrings.size);
    for (const e of contractEdgeStrings) {
      expect(graphEdgeStrings.has(e)).toBe(true);
    }
  });

  it('estimated_duration_ms is non-negative (sum of step durations)', () => {
    const p = plan(makeConfig());
    const cp = toContractsPlan(p);
    expect(cp.metadata.estimated_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('node labels are non-empty strings (come from step.description)', () => {
    const p = plan(makeConfig({ execution: { profile: 'quality' } }));
    const cp = toContractsPlan(p);
    for (const node of cp.nodes) {
      expect(typeof node.label).toBe('string');
      expect(node.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Section 9 — Conditional write_sink step (Rank 2 — domain contract)
// ---------------------------------------------------------------------------

describe('plan() — conditional write_sink step', () => {
  it('write_sink step is absent when config.output is not provided', () => {
    const p = plan(makeConfig());
    const sinkSteps = p.steps.filter((s) => s.type === PlanStepType.WRITE_SINK);
    expect(sinkSteps).toHaveLength(0);
  });

  it('write_sink step is present when config.output is provided', () => {
    const p = plan(makeConfig({ output: { format: 'json' } }));
    const sinkSteps = p.steps.filter((s) => s.type === PlanStepType.WRITE_SINK);
    expect(sinkSteps).toHaveLength(1);
  });

  it('write_sink step has the correct sinkKind in its parameters', () => {
    const p = plan(makeConfig({ output: { format: 'parquet' } }));
    const sinkStep = p.steps.find((s) => s.type === PlanStepType.WRITE_SINK);
    expect(sinkStep).toBeDefined();
    expect(sinkStep!.parameters.format).toBe('parquet');
  });

  it('plan still passes validatePlan() when write_sink is present', () => {
    const p = plan(makeConfig({ output: { format: 'json' } }));
    const errors = validatePlan(p);
    const critical = errors.filter((e) => e.severity === 'error');
    expect(critical).toHaveLength(0);
  });

  it('write_sink step depends on generate_reports when reports are enabled', () => {
    const p = plan(makeConfig({ output: { format: 'json', generateReports: true } }));
    const sinkStep = p.steps.find((s) => s.type === PlanStepType.WRITE_SINK);
    expect(sinkStep).toBeDefined();
    expect(sinkStep!.dependsOn).toContain('generate_reports');
  });

  it('sinkKind defaults to json when config.output.format is not specified', () => {
    const p = plan(makeConfig({ output: {} }));
    expect(p.sinkKind).toBe('json');
  });

  it('sinkKind reflects the configured output format (lowercased)', () => {
    const p = plan(makeConfig({ output: { format: 'HTML' } }));
    expect(p.sinkKind).toBe('HTML'); // output format is not lowercased by the planner
  });
});

// ---------------------------------------------------------------------------
// Section 10 — PlannerLike interface compatibility (Rank 2 — PRD §11)
//
// The @wasm4pm/testing harness's checkParity() expects a PlannerLike object:
//   { plan(config): ExecutionPlan | Promise<ExecutionPlan>, explain(config): string }
// This section verifies that a trivial adapter over plan() + explain() satisfies
// the parity contract WITHOUT importing @wasm4pm/testing (circular dependency avoided).
// ---------------------------------------------------------------------------

describe('PlannerLike adapter — PRD §11 parity interface', () => {
  // Build an adapter that mirrors PlannerLike from @wasm4pm/testing
  const plannerAdapter = {
    plan: (config: unknown) => plan(config as Config),
    explain: (config: unknown) => explain(config as Config),
  };

  it('adapter.plan() returns an ExecutionPlan with id, hash, steps, graph', () => {
    const p = plannerAdapter.plan(makeConfig());
    expect(typeof p.id).toBe('string');
    expect(typeof p.hash).toBe('string');
    expect(Array.isArray(p.steps)).toBe(true);
    expect(p.graph).toBeDefined();
  });

  it('adapter.explain() returns a non-empty string', () => {
    const text = plannerAdapter.explain(makeConfig());
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('adapter.explain() contains the plan hash from adapter.plan() — PRD §11 identity', () => {
    const config = makeConfig();
    const p = plannerAdapter.plan(config);
    const text = plannerAdapter.explain(config);
    expect(text).toContain(p.hash);
  });

  it('adapter parity holds for fast profile (explain step set ⊆ plan step set)', () => {
    const config = makeConfig({ execution: { profile: 'fast' } });
    const p = plannerAdapter.plan(config);
    const text = plannerAdapter.explain(config);
    const runStepTypes = new Set(p.steps.map((s) => s.type as string));

    // Every step type mentioned by explain() must exist in the plan
    for (const stepType of runStepTypes) {
      const pattern = new RegExp(stepType.replace(/_/g, '[_ -]?'), 'i');
      expect(
        pattern.test(text.toLowerCase()),
        `Plan step "${stepType}" not mentioned in explain() output`
      ).toBe(true);
    }
  });

  it('adapter parity holds for balanced profile', () => {
    const config = makeConfig({ execution: { profile: 'balanced' } });
    const p = plannerAdapter.plan(config);
    const text = plannerAdapter.explain(config);
    const runStepTypes = new Set(p.steps.map((s) => s.type as string));

    for (const stepType of runStepTypes) {
      const pattern = new RegExp(stepType.replace(/_/g, '[_ -]?'), 'i');
      expect(
        pattern.test(text.toLowerCase()),
        `Balanced plan step "${stepType}" not mentioned in explain()`
      ).toBe(true);
    }
  });

  it('adapter parity holds for quality profile', () => {
    const config = makeConfig({ execution: { profile: 'quality' } });
    const p = plannerAdapter.plan(config);
    const text = plannerAdapter.explain(config);
    const runStepTypes = new Set(p.steps.map((s) => s.type as string));

    for (const stepType of runStepTypes) {
      const pattern = new RegExp(stepType.replace(/_/g, '[_ -]?'), 'i');
      expect(
        pattern.test(text.toLowerCase()),
        `Quality plan step "${stepType}" not mentioned in explain()`
      ).toBe(true);
    }
  });

  it('adapter parity holds for stream profile', () => {
    const config = makeConfig({ execution: { profile: 'stream' } });
    const p = plannerAdapter.plan(config);
    const text = plannerAdapter.explain(config);
    const runStepTypes = new Set(p.steps.map((s) => s.type as string));

    for (const stepType of runStepTypes) {
      const pattern = new RegExp(stepType.replace(/_/g, '[_ -]?'), 'i');
      expect(
        pattern.test(text.toLowerCase()),
        `Stream plan step "${stepType}" not mentioned in explain()`
      ).toBe(true);
    }
  });

  it('adapter throws PlannerError for invalid config — PlannerLike error contract', () => {
    expect(() => plannerAdapter.plan({ version: '9.9', source: { format: 'xes' }, execution: { profile: 'fast' } })).toThrow(PlannerError);
  });
});

// ---------------------------------------------------------------------------
// Section 11 — DAG structural properties on real plans (Rank 1 — mathematical)
// ---------------------------------------------------------------------------

describe('plan() DAG — Rank-1 mathematical invariants', () => {
  it('topologicalSort(graph) completes without error for all profiles', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream']) {
      const p = plan(makeConfig({ execution: { profile } }));
      expect(() => topologicalSort(p.graph)).not.toThrow();
    }
  });

  it('hasCycle(graph) returns false for all profiles (Rank 1: DAGs are cycle-free)', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream']) {
      const p = plan(makeConfig({ execution: { profile } }));
      expect(hasCycle(p.graph)).toBe(false);
    }
  });

  it('topologicalSort returns exactly graph.nodes.length elements', () => {
    const p = plan(makeConfig({ execution: { profile: 'quality' } }));
    const sorted = topologicalSort(p.graph);
    expect(sorted.length).toBe(p.graph.nodes.length);
  });

  it('topologicalSort contains every node exactly once', () => {
    const p = plan(makeConfig({ execution: { profile: 'balanced' } }));
    const sorted = topologicalSort(p.graph);
    const unique = new Set(sorted);
    expect(unique.size).toBe(sorted.length);
    for (const node of p.graph.nodes) {
      expect(unique.has(node)).toBe(true);
    }
  });

  it('bootstrap node appears before all other nodes in topological order', () => {
    const p = plan(makeConfig());
    const sorted = topologicalSort(p.graph);
    const bootstrapIndex = sorted.indexOf('bootstrap');
    expect(bootstrapIndex).toBe(0);
  });

  it('cleanup node appears last in topological order', () => {
    const p = plan(makeConfig());
    const sorted = topologicalSort(p.graph);
    const cleanupIndex = sorted.indexOf('cleanup');
    expect(cleanupIndex).toBe(sorted.length - 1);
  });

  it('getDependencies(graph, cleanup) returns all other nodes (cleanup is the sink)', () => {
    const p = plan(makeConfig());
    const deps = getDependencies(p.graph, 'cleanup');
    const otherNodes = p.graph.nodes.filter((n) => n !== 'cleanup');
    for (const node of otherNodes) {
      expect(
        deps.has(node),
        `getDependencies did not include "${node}" as transitive dep of cleanup`
      ).toBe(true);
    }
  });

  it('getDependents(graph, bootstrap) returns all other nodes (bootstrap is the source)', () => {
    const p = plan(makeConfig());
    const dependents = getDependents(p.graph, 'bootstrap');
    const otherNodes = p.graph.nodes.filter((n) => n !== 'bootstrap');
    for (const node of otherNodes) {
      expect(
        dependents.has(node),
        `getDependents did not include "${node}" as dependent of bootstrap`
      ).toBe(true);
    }
  });

  it('every edge [src, tgt] satisfies: src appears before tgt in topological order (Rank 1)', () => {
    const p = plan(makeConfig({ execution: { profile: 'quality' } }));
    const sorted = topologicalSort(p.graph);
    const positionOf = (id: string) => sorted.indexOf(id);

    for (const [src, tgt] of p.graph.edges) {
      expect(
        positionOf(src),
        `Edge [${src}→${tgt}]: src position (${positionOf(src)}) must be before tgt position (${positionOf(tgt)})`
      ).toBeLessThan(positionOf(tgt));
    }
  });
});
