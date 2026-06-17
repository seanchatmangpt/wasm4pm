/**
 * kernel-dispatch.bench.ts
 *
 * Vitest bench suite for kernel dispatch throughput against real XES datasets.
 * Uses the actual WASM binary (@wasm4pm/core) — skip gracefully if the pkg is absent.
 *
 * Naming convention: describe('kernel-dispatch/{algo}/{dataset}') so grep can
 * isolate per-algorithm, per-dataset results from the bench reporter output.
 *
 * Datasets
 *   bpi2020  — /Users/sac/wasm4pm/bench_data/bpi2020_travel.xes
 *   rt100    — /Users/sac/wasm4pm/bench_data/roadtraffic100traces.xes
 *
 * 10 algorithms under test:
 *   dfg, heuristic_miner, inductive_miner, ilp, hill_climbing,
 *   simulated_annealing, transition_system, log_to_trie, batches,
 *   correlation_miner
 */

import { readFileSync, existsSync } from 'node:fs';
import { bench, describe, beforeAll } from 'vitest';
import { Kernel } from '../api.js';
import type { KernelWasmModule } from '../api.js';

// ── Guard: skip entire suite if WASM binary is absent ────────────────────────

const WASM_PKG_PATH = '/Users/sac/wasm4pm/wasm4pm/pkg';
const WASM_AVAILABLE = existsSync(WASM_PKG_PATH);

// ── Budget: keep wall-clock cost low to prevent OOM / runaway CI ─────────────

const FAST = { time: 200, iterations: 20 } as const;

// ── Inline XES reader ─────────────────────────────────────────────────────────

function readXesFile(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`XES file not found: ${path}`);
  }
  return readFileSync(path, 'utf-8');
}

// ── Module-scope state (populated in beforeAll) ───────────────────────────────
//
// vitest describe() bodies run synchronously during collection, before any
// top-level await can resolve.  Use beforeAll (file-scoped, runs once before
// any bench in this file) to init the kernel and load the event logs.

let kernel: Kernel | null = null;
let bpi2020Handle: string | null = null;
let rt100Handle: string | null = null;
let ready = false;

beforeAll(async () => {
  if (!WASM_AVAILABLE) return;
  const wasm = (await import('@wasm4pm/core')) as unknown as KernelWasmModule;
  kernel = new Kernel(wasm);
  await kernel.init();

  const bpi2020Xes = readXesFile('/Users/sac/wasm4pm/bench_data/bpi2020_travel.xes');
  const rt100Xes = readXesFile('/Users/sac/wasm4pm/bench_data/roadtraffic100traces.xes');

  bpi2020Handle = await kernel.loadEventLog(bpi2020Xes);
  rt100Handle = await kernel.loadEventLog(rt100Xes);
  ready = true;
});

// ─────────────────────────────────────────────────────────────────────────────
// dfg
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/dfg/bpi2020', () => {
  bench('dfg — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('dfg', bpi2020Handle, { activity_key: 'concept:name' });
  }, FAST);
});

describe('kernel-dispatch/dfg/rt100', () => {
  bench('dfg — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('dfg', rt100Handle, { activity_key: 'concept:name' });
  }, FAST);
});

// ─────────────────────────────────────────────────────────────────────────────
// heuristic_miner
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/heuristic_miner/bpi2020', () => {
  bench('heuristic_miner — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('heuristic_miner', bpi2020Handle, {
      activity_key: 'concept:name',
      dependency_threshold: 0.3,
    });
  }, FAST);
});

describe('kernel-dispatch/heuristic_miner/rt100', () => {
  bench('heuristic_miner — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('heuristic_miner', rt100Handle, {
      activity_key: 'concept:name',
      dependency_threshold: 0.3,
    });
  }, FAST);
});

// ─────────────────────────────────────────────────────────────────────────────
// inductive_miner
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/inductive_miner/bpi2020', () => {
  bench('inductive_miner — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('inductive_miner', bpi2020Handle, { activity_key: 'concept:name' });
  }, FAST);
});

describe('kernel-dispatch/inductive_miner/rt100', () => {
  bench('inductive_miner — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('inductive_miner', rt100Handle, { activity_key: 'concept:name' });
  }, FAST);
});

// ─────────────────────────────────────────────────────────────────────────────
// ilp
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/ilp/bpi2020', () => {
  bench('ilp — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('ilp', bpi2020Handle, { activity_key: 'concept:name' });
  }, FAST);
});

describe('kernel-dispatch/ilp/rt100', () => {
  bench('ilp — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('ilp', rt100Handle, { activity_key: 'concept:name' });
  }, FAST);
});

// ─────────────────────────────────────────────────────────────────────────────
// hill_climbing
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/hill_climbing/bpi2020', () => {
  bench('hill_climbing — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('hill_climbing', bpi2020Handle, { activity_key: 'concept:name' });
  }, FAST);
});

describe('kernel-dispatch/hill_climbing/rt100', () => {
  bench('hill_climbing — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('hill_climbing', rt100Handle, { activity_key: 'concept:name' });
  }, FAST);
});

// ─────────────────────────────────────────────────────────────────────────────
// simulated_annealing
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/simulated_annealing/bpi2020', () => {
  bench('simulated_annealing — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('simulated_annealing', bpi2020Handle, { activity_key: 'concept:name' });
  }, FAST);
});

describe('kernel-dispatch/simulated_annealing/rt100', () => {
  bench('simulated_annealing — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('simulated_annealing', rt100Handle, { activity_key: 'concept:name' });
  }, FAST);
});

// ─────────────────────────────────────────────────────────────────────────────
// transition_system
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/transition_system/bpi2020', () => {
  bench('transition_system — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('transition_system', bpi2020Handle, { activity_key: 'concept:name' });
  }, FAST);
});

describe('kernel-dispatch/transition_system/rt100', () => {
  bench('transition_system — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('transition_system', rt100Handle, { activity_key: 'concept:name' });
  }, FAST);
});

// ─────────────────────────────────────────────────────────────────────────────
// log_to_trie
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/log_to_trie/bpi2020', () => {
  bench('log_to_trie — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('log_to_trie', bpi2020Handle, { activity_key: 'concept:name' });
  }, FAST);
});

describe('kernel-dispatch/log_to_trie/rt100', () => {
  bench('log_to_trie — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('log_to_trie', rt100Handle, { activity_key: 'concept:name' });
  }, FAST);
});

// ─────────────────────────────────────────────────────────────────────────────
// batches
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/batches/bpi2020', () => {
  bench('batches — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('batches', bpi2020Handle, { activity_key: 'concept:name' });
  }, FAST);
});

describe('kernel-dispatch/batches/rt100', () => {
  bench('batches — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('batches', rt100Handle, { activity_key: 'concept:name' });
  }, FAST);
});

// ─────────────────────────────────────────────────────────────────────────────
// correlation_miner
// ─────────────────────────────────────────────────────────────────────────────

describe('kernel-dispatch/correlation_miner/bpi2020', () => {
  bench('correlation_miner — bpi2020_travel', async () => {
    if (!ready || !kernel || !bpi2020Handle) return;
    await kernel.run('correlation_miner', bpi2020Handle, { activity_key: 'concept:name' });
  }, FAST);
});

describe('kernel-dispatch/correlation_miner/rt100', () => {
  bench('correlation_miner — roadtraffic100traces', async () => {
    if (!ready || !kernel || !rt100Handle) return;
    await kernel.run('correlation_miner', rt100Handle, { activity_key: 'concept:name' });
  }, FAST);
});
