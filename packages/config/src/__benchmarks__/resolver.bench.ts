/**
 * Config resolution benchmarks.
 *
 * Context: resolveConfig() runs before every `wpm` command. It performs a
 * 5-layer merge (defaults → env → JSON file → TOML file → CLI overrides),
 * applies deep-merge semantics across all layers, then validates the result
 * through a full Zod parse. These benchmarks expose the cost of each
 * sub-operation so regressions surface before they reach production.
 *
 * Operations under measurement:
 *   - validate() / validatePartial()  — Zod parse + ML migration pass
 *   - trackProvenance()               — recursive leaf-walk over config objects
 *   - mergeProvenance()               — Object.assign across provenance maps
 *   - hashConfig()                    — stable-stringify + BLAKE3 digest
 *   - resolveConfig()                 — full 5-layer resolution (no file I/O)
 */

import { bench, describe } from 'vitest';
import { validate, validatePartial } from '../schema.js';
import { trackProvenance, mergeProvenance } from '../provenance.js';
import { hashConfig } from '../hash.js';
import { resolveConfig } from '../resolver.js';

// ---------------------------------------------------------------------------
// Shared option: sub-microsecond operations use tighter iteration budgets so
// the suite completes in a predictable wall-clock window on CI machines.
// ---------------------------------------------------------------------------
const FAST = { time: 100, iterations: 50 };

// ---------------------------------------------------------------------------
// Minimal config — smallest valid input that satisfies the required fields.
// ---------------------------------------------------------------------------
const MINIMAL_CONFIG = {
  version: '26.4.5',
  source: { kind: 'file' as const },
};

// ---------------------------------------------------------------------------
// Full config — all optional sections populated to stress the Zod parse path.
// ---------------------------------------------------------------------------
const FULL_CONFIG = {
  version: '26.4.5',
  source: { kind: 'file' as const, path: './events.xes' },
  sink: { kind: 'stdout' as const },
  algorithm: { name: 'heuristic_miner' as const, parameters: { dependency_threshold: 0.3 } },
  execution: { profile: 'balanced' as const, timeout: 300000, maxMemory: 1073741824 },
  observability: {
    logLevel: 'info' as const,
    metricsEnabled: false,
    otel: { enabled: false, exporter: 'otlp' as const, required: false },
  },
  watch: { enabled: false, poll_interval: 1000 },
  output: { format: 'human' as const, destination: 'stdout', pretty: true, colorize: true },
  prediction: {
    enabled: true,
    activityKey: 'concept:name',
    ngramOrder: 2,
    driftWindowSize: 10,
    tasks: ['next_activity' as const, 'drift' as const],
    drift: { ewma_alpha: 0.2, threshold: 0.3 },
  },
  ml: {
    enabled: true,
    tasks: ['classify' as const, 'cluster' as const, 'anomaly' as const],
    classify: { model: 'decision_tree' as const, targetKey: 'outcome', k: 5 },
    cluster: { method: 'kmeans' as const, k: 5, eps: 1.0 },
    anomaly: { method: 'ema' as const, alpha: 0.3, threshold: 2.5 },
  },
  rl: {
    enabled: false,
    agents: ['QLearning' as const],
    learning_rate: 0.1,
    discount_factor: 0.99,
    epsilon: 0.1,
  },
};

// ---------------------------------------------------------------------------
// Provenance map fixtures — used for mergeProvenance benchmarks.
// ---------------------------------------------------------------------------
const SMALL_OBJ = {
  algorithm: 'dfg',
  profile: 'balanced',
  logLevel: 'info',
};

const LARGE_OBJ = {
  version: '26.4.5',
  source: { kind: 'file', path: './events.xes' },
  sink: { kind: 'stdout' },
  algorithm: { name: 'heuristic_miner', parameters: { dependency_threshold: 0.3 } },
  execution: { profile: 'balanced', timeout: 300000, maxMemory: 1073741824 },
  observability: {
    logLevel: 'info',
    metricsEnabled: false,
    otel: { enabled: false, exporter: 'otlp', required: false },
  },
  watch: { enabled: false, poll_interval: 1000 },
  output: { format: 'human', destination: 'stdout', pretty: true, colorize: true },
  prediction: {
    enabled: true,
    activityKey: 'concept:name',
    ngramOrder: 2,
    driftWindowSize: 10,
    tasks: ['next_activity', 'drift'],
    drift: { ewma_alpha: 0.2, threshold: 0.3 },
  },
  ml: {
    enabled: true,
    tasks: ['classify', 'cluster', 'anomaly'],
    classify: { model: 'decision_tree', targetKey: 'outcome', k: 5 },
    cluster: { method: 'kmeans', k: 5, eps: 1.0 },
    anomaly: { method: 'ema', alpha: 0.3, threshold: 2.5 },
  },
};

// Pre-build provenance maps once — the bench exercises mergeProvenance, not trackProvenance.
const smallMap = trackProvenance(SMALL_OBJ, 'default');
const largeMap = trackProvenance(LARGE_OBJ as Record<string, unknown>, 'toml', './wasm4pm.toml');

// ---------------------------------------------------------------------------
// 1. validate() / validatePartial()
// ---------------------------------------------------------------------------
describe('validate() / validatePartial()', () => {
  bench('validate() — minimal config', () => {
    validate(MINIMAL_CONFIG);
  }, FAST);

  bench('validate() — full config', () => {
    validate(FULL_CONFIG);
  }, FAST);

  bench('validatePartial() — minimal config', () => {
    validatePartial(MINIMAL_CONFIG);
  }, FAST);

  bench('validatePartial() — full config', () => {
    validatePartial(FULL_CONFIG);
  }, FAST);
});

// ---------------------------------------------------------------------------
// 2. trackProvenance()
// ---------------------------------------------------------------------------
describe('trackProvenance()', () => {
  bench('trackProvenance() — small object (3 leaves)', () => {
    trackProvenance(SMALL_OBJ, 'default');
  }, FAST);

  bench('trackProvenance() — large object (~30 leaves)', () => {
    trackProvenance(LARGE_OBJ as Record<string, unknown>, 'toml', './wasm4pm.toml');
  }, FAST);
});

// ---------------------------------------------------------------------------
// 3. mergeProvenance()
// ---------------------------------------------------------------------------
describe('mergeProvenance()', () => {
  bench('mergeProvenance() — two small maps', () => {
    mergeProvenance(smallMap, smallMap);
  }, FAST);

  bench('mergeProvenance() — two large maps', () => {
    mergeProvenance(largeMap, largeMap);
  }, FAST);
});

// ---------------------------------------------------------------------------
// 4. hashConfig()
// ---------------------------------------------------------------------------
describe('hashConfig()', () => {
  // hashConfig() requires a BaseConfig — use validate() output.
  const minimalValidated = validate(MINIMAL_CONFIG);
  const fullValidated = validate(FULL_CONFIG);

  bench('hashConfig() — minimal config', () => {
    hashConfig(minimalValidated);
  }, FAST);

  bench('hashConfig() — full config', () => {
    hashConfig(fullValidated);
  }, FAST);
});

// ---------------------------------------------------------------------------
// 5. resolveConfig() — defaults only, no file I/O
// ---------------------------------------------------------------------------
describe('resolveConfig() — defaults only', () => {
  bench('resolveConfig() — empty configSearchPaths, empty env', async () => {
    await resolveConfig({ configSearchPaths: [], env: {} });
  });
});

// ---------------------------------------------------------------------------
// 6. resolveConfig() — with CLI overrides
// ---------------------------------------------------------------------------
describe('resolveConfig() — with cliOverrides', () => {
  bench('resolveConfig() — cliOverrides: { profile: "fast" }', async () => {
    await resolveConfig({
      configSearchPaths: [],
      env: {},
      cliOverrides: { profile: 'fast' },
    });
  });
});
