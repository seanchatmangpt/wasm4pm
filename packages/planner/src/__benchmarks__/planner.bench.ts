/**
 * planner.bench.ts
 *
 * Benchmarks for plan() and individual step-creation factory functions.
 * plan() is called before every wpm run — its latency sets the floor for
 * CLI startup time.
 */

import { bench, describe } from 'vitest';
import { plan } from '../planner.js';
import {
  PlanStepType,
  createBootstrapStep,
  createInitWasmStep,
  createLoadSourceStep,
  createValidateSourceStep,
  createAlgorithmStep,
  createGenerateReportsStep,
  createSinkStep,
  createCleanupStep,
} from '../steps.js';
import { hasCycle, topologicalSort, validateDAG } from '../dag.js';
import type { DAG } from '../dag.js';

// Limit sample count for sub-100µs bench cases to prevent worker-thread OOM.
// vitest 1.x collects all samples as JS heap objects; at >10k hz the array
// grows large enough to crash during result serialization.
const FAST = { time: 200, iterations: 50 } as const;

// ── Fixed config fixtures ─────────────────────────────────────────────────────

const BASE_SOURCE = { format: 'xes', content: '<log />' };

const CONFIG_FAST = {
  version: '1.0' as const,
  source: BASE_SOURCE,
  execution: { profile: 'fast' as const, maxEvents: 100 },
};
const CONFIG_BALANCED = {
  version: '1.0' as const,
  source: BASE_SOURCE,
  execution: { profile: 'balanced' as const, maxEvents: 1000 },
};
const CONFIG_QUALITY = {
  version: '1.0' as const,
  source: BASE_SOURCE,
  execution: { profile: 'quality' as const, maxEvents: 10000 },
};
const CONFIG_STREAM = {
  version: '1.0' as const,
  source: BASE_SOURCE,
  execution: { profile: 'stream' as const, maxEvents: 10000 },
};

// ── plan() — all 4 profiles ───────────────────────────────────────────────────

describe('plan() — profile generation latency', () => {
  bench('fast profile (100 events)', () => { plan(CONFIG_FAST); });
  bench('balanced profile (1K events)', () => { plan(CONFIG_BALANCED); });
  bench('quality profile (10K events)', () => { plan(CONFIG_QUALITY); });
  bench('stream profile (10K events)', () => { plan(CONFIG_STREAM); }, FAST);
});

// ── Step factory microbenchmarks ──────────────────────────────────────────────

describe('step factories — individual creation cost', () => {
  bench('createBootstrapStep()', () => { createBootstrapStep(); }, FAST);
  bench('createInitWasmStep()', () => { createInitWasmStep(); }, FAST);
  bench('createLoadSourceStep("xes")', () => { createLoadSourceStep('xes'); }, FAST);
  bench('createValidateSourceStep()', () => { createValidateSourceStep(); }, FAST);
  bench('createAlgorithmStep("dfg")', () => { createAlgorithmStep('dfg', PlanStepType.DISCOVER_DFG); }, FAST);
  bench('createAlgorithmStep("heuristic_miner")', () => { createAlgorithmStep('heuristic_miner', PlanStepType.DISCOVER_HEURISTIC); }, FAST);
  bench('createGenerateReportsStep(["dfg"])', () => { createGenerateReportsStep(['dfg']); }, FAST);
  bench('createSinkStep("json", ["dfg"])', () => { createSinkStep('json', ['dfg']); }, FAST);
  bench('createCleanupStep(3 steps)', () => { createCleanupStep(['bootstrap', 'init_wasm', 'dfg']); }, FAST);
});

// ── DAG utilities ─────────────────────────────────────────────────────────────

// DAG edges are [from, to] tuples per the Zod schema
const SMALL_DAG: DAG = {
  nodes: ['bootstrap', 'init_wasm', 'load_source', 'validate', 'dfg', 'sink'],
  edges: [
    ['bootstrap', 'init_wasm'],
    ['init_wasm', 'load_source'],
    ['load_source', 'validate'],
    ['validate', 'dfg'],
    ['dfg', 'sink'],
  ],
};

const LARGE_DAG: DAG = {
  nodes: Array.from({ length: 20 }, (_, i) => `step_${i}`),
  edges: Array.from({ length: 19 }, (_, i) => [`step_${i}`, `step_${i + 1}`] as [string, string]),
};

// Fan-out DAG: one source feeding 10 parallel nodes
const FANOUT_DAG: DAG = {
  nodes: ['source', ...Array.from({ length: 10 }, (_, i) => `algo_${i}`), 'sink'],
  edges: [
    ...Array.from({ length: 10 }, (_, i) => ['source', `algo_${i}`] as [string, string]),
    ...Array.from({ length: 10 }, (_, i) => [`algo_${i}`, 'sink'] as [string, string]),
  ],
};

describe('DAG utilities', () => {
  bench('hasCycle — 6 nodes linear', () => { hasCycle(SMALL_DAG); }, FAST);
  bench('topologicalSort — 6 nodes linear', () => { topologicalSort(SMALL_DAG); }, FAST);
  bench('validateDAG — 6 nodes linear', () => { validateDAG(SMALL_DAG); }, FAST);
  bench('topologicalSort — 20 nodes linear', () => { topologicalSort(LARGE_DAG); }, FAST);
  bench('topologicalSort — fan-out (10 parallel)', () => { topologicalSort(FANOUT_DAG); }, FAST);
  bench('validateDAG — fan-out (10 parallel)', () => { validateDAG(FANOUT_DAG); }, FAST);
});
