/**
 * e2e-discovery.test.ts
 *
 * E2E-01: DFG Discovery from a minimal 3-activity log.
 * E2E-03: Edge case discovery (single-event log, empty log).
 *
 * The WASM layer is stubbed with a minimal mock that satisfies the
 * WasmModule interface. This isolates the TypeScript Kernel facade
 * and its dispatch/validation logic without requiring a compiled WASM binary.
 *
 * Per .claude/rules/chicago-tdd.md: oracles are domain-derived, not
 * self-referential.  We assert *structural invariants* (handle is non-empty
 * string, outputType matches registry expectation, durationMs >= 0) rather
 * than exact WASM output values.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../api.js';
import type { KernelWasmModule } from '../api.js';

// ─── Minimal XES fixtures ─────────────────────────────────────────────────────

/** Three-activity log: two traces A→B→C and A→C. */
const XES_3_ACTIVITY = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xes.features="nested-attributes">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T10:00:00Z"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T10:05:00Z"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T10:10:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T11:00:00Z"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T11:05:00Z"/></event>
  </trace>
</log>`;

/** Single-event log: one trace with exactly one event. */
const XES_SINGLE_EVENT = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case-only"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T09:00:00Z"/></event>
  </trace>
</log>`;

/** Empty log: log element with no traces. */
const XES_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
</log>`;

// ─── WASM stub ────────────────────────────────────────────────────────────────

/**
 * Build a stub WasmModule that tracks which XES was loaded and returns
 * deterministic handles.  The stub is stateful so we can verify that
 * handle identities differ across distinct log loads (FM-1 regression).
 */
function buildWasmStub(): KernelWasmModule & {
  _loadedXes: string[];
  _handleCounter: number;
  load_eventlog_from_xes(xes: string): string;
} {
  let handleCounter = 0;
  const loadedXes: string[] = [];

  // Build the WASM-interface-conforming object first, then attach test tracking
  // fields via Object.assign to avoid the TS2353 "unknown property" error that
  // arises when extra fields appear inside an object literal checked with
  // `satisfies KernelWasmModule`.
  const wasmFacade = {
    // Called by the kernel during init() — optional in the interface.
    async init() {},

    // XES loading helper used in tests directly.
    load_eventlog_from_xes(xes: string): string {
      loadedXes.push(xes);
      handleCounter++;
      return `log_handle_${handleCounter}`;
    },

    // DFG discovery — returns a handle keyed to the input log handle.
    async discover_dfg(logHandle: string, _activityKey: string) {
      return { handle: `dfg_result_for_${logHandle}` };
    },

    // Alpha++ — not used in these E2E tests but must satisfy the interface.
    async discover_alpha_plus_plus(logHandle: string, _activityKey: string) {
      return { handle: `alpha_result_for_${logHandle}` };
    },

    // Heuristic miner.
    async discover_heuristic_miner(logHandle: string, _activityKey: string, _threshold: number) {
      return { handle: `heuristic_result_for_${logHandle}` };
    },

    // Inductive miner.
    async discover_inductive_miner(logHandle: string, _activityKey: string, _noise: number) {
      return { handle: `inductive_result_for_${logHandle}` };
    },

    // Genetic algorithm.
    async discover_genetic_algorithm(
      logHandle: string,
      _activityKey: string,
      _popSize: number,
      _generations: number
    ) {
      return { handle: `genetic_result_for_${logHandle}` };
    },

    // PSO.
    async discover_pso_algorithm(
      logHandle: string,
      _activityKey: string,
      _swarmSize: number,
      _iterations: number
    ) {
      return { handle: `pso_result_for_${logHandle}` };
    },

    // A*.
    async discover_astar(logHandle: string, _activityKey: string, _maxIter: number) {
      return { handle: `astar_result_for_${logHandle}` };
    },

    // Hill climbing.
    async discover_hill_climbing(logHandle: string, _activityKey: string, _maxIter: number) {
      return { handle: `hill_result_for_${logHandle}` };
    },

    // ILP.
    async discover_ilp_petri_net(logHandle: string, _activityKey: string, _timeout: number) {
      return { handle: `ilp_result_for_${logHandle}` };
    },

    // ACO.
    async discover_ant_colony(
      logHandle: string,
      _activityKey: string,
      _colonySize: number,
      _iterations: number
    ) {
      return { handle: `aco_result_for_${logHandle}` };
    },

    // Simulated annealing.
    async discover_simulated_annealing(
      logHandle: string,
      _activityKey: string,
      _temp: number,
      _cooling: number
    ) {
      return { handle: `sa_result_for_${logHandle}` };
    },

    // Declare.
    async discover_declare(logHandle: string, _activityKey: string, _support: number) {
      return { handle: `declare_result_for_${logHandle}` };
    },

    // Process skeleton.
    async extract_process_skeleton(
      logHandle: string,
      _activityKey: string,
      _minFreq: number
    ) {
      return { handle: `skeleton_result_for_${logHandle}` };
    },

    // POWL discovery.
    async discover_powl_from_log(_logJson: string, variant: string) {
      return { root: 0, node_count: 1, repr: '()', variant };
    },

    async discover_powl_from_log_config(
      _logJson: string,
      activityKey: string,
      variant: string,
      _minTraceCount: number,
      _noiseThreshold: number
    ) {
      return {
        root: 0,
        node_count: 1,
        repr: '()',
        variant,
        config: { activity_key: activityKey, min_trace_count: 1, noise_threshold: 0.2 },
      };
    },

    // Wave 1 migration stubs.
    async discover_transition_system(_h: string, _w: number, _d: string) {
      return { handle: 'ts_handle' };
    },
    async discover_prefix_tree(_h: string, _k: string) {
      return { handle: 'trie_handle' };
    },
    async discover_causal_graph(_h: string, _k: string, _m: string, _t: number) {
      return { handle: 'causal_handle' };
    },
    async discover_performance_spectrum(_h: string, _k: string, _t: string) {
      return { handle: 'perf_handle' };
    },
    async discover_batches(_h: string, _k: string, _t: string, _b: number) {
      return { handle: 'batches_handle' };
    },
    async discover_correlation(_h: string, _k: string, _t: string) {
      return { handle: 'corr_handle' };
    },
    async generalization(_h: string, _p: string, _k: string) {
      return { handle: 'gen_handle' };
    },
    async reduce_petri_net(_p: string) {
      return { handle: 'reduced_handle' };
    },
    async wasm_compute_precision(_h: string, _p: string, _k: string) {
      return { handle: 'precision_handle' };
    },
    wasm_compute_simplicity(_places: number, _trans: number, _arcs: number): number {
      return 0.9;
    },
    async compute_optimal_alignments(_h: string, _p: string, _k: string, _c: string) {
      return { handle: 'align_handle' };
    },
    async measure_complexity(_p: string) {
      return { handle: 'complexity_handle' };
    },
    async from_pnml(_xml: string) {
      return { handle: 'pnml_handle' };
    },
    async read_bpmn(_xml: string) {
      return { handle: 'bpmn_handle' };
    },
    async powl_to_process_tree(_h: string) {
      return { handle: 'tree_handle' };
    },
    async powl_to_yawl_string(_s: string): Promise<string> {
      return '{}';
    },
    async play_out(_m: string, _n: number, _l: number) {
      return { handle: 'playout_handle' };
    },
    async monte_carlo_simulation(_l: string, _p: string, _r: string, _c: string) {
      return { handle: 'mc_handle' };
    },
    extract_case_features(
      _h: string,
      _k: string,
      _t: string,
      _c: string
    ): string {
      return JSON.stringify({ traces: [] });
    },
    detect_drift(_h: string, _k: string, _w: number): string {
      return JSON.stringify({ drifts: [] });
    },
    async discover_ocel_dfg(_h: string) {
      return { handle: 'ocel_dfg_handle' };
    },
    async discover_ocel_dfg_per_type(_h: string) {
      return { handle: 'ocel_dfg_per_type_handle' };
    },
    delete_object(_handle: string) {},
    clear_all_objects() {},
  } satisfies KernelWasmModule;

  // Attach test-private tracking properties. Object.assign does not preserve
  // getter descriptors, so use defineProperty for the counter getter.
  (wasmFacade as Record<string, unknown>)['_loadedXes'] = loadedXes;
  Object.defineProperty(wasmFacade, '_handleCounter', {
    get() { return handleCounter; },
    enumerable: true,
    configurable: true,
  });

  return wasmFacade as KernelWasmModule & {
    _loadedXes: string[];
    _handleCounter: number;
    load_eventlog_from_xes(xes: string): string;
  };
}

// ─── E2E-01: DFG Discovery ────────────────────────────────────────────────────

describe('E2E-01: DFG Discovery', () => {
  let kernel: Kernel;
  let stub: ReturnType<typeof buildWasmStub>;

  beforeEach(async () => {
    stub = buildWasmStub();
    kernel = new Kernel(stub);
    await kernel.init();
  });

  it('discovers DFG from a minimal 3-activity log — result shape is valid', async () => {
    // Load the log via the stub's helper (simulates wasm.load_eventlog_from_xes).
    const logHandle = stub.load_eventlog_from_xes(XES_3_ACTIVITY);
    expect(logHandle).toBeTruthy();

    const result = await kernel.run('dfg', logHandle, { activity_key: 'concept:name' });

    // Structural invariants — these hold for any correct kernel output.
    expect(result.handle).toBeTruthy();
    expect(typeof result.handle).toBe('string');
    expect(result.handle.length).toBeGreaterThan(0);

    // outputType must match the registry expectation for 'dfg'.
    expect(result.outputType).toBe('dfg');
    expect(result.algorithm).toBe('dfg');

    // durationMs must be non-negative.
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // execution_ms must mirror durationMs (API clarity field).
    expect(result.execution_ms).toBe(result.durationMs);

    // The params record must carry back the activity_key used.
    expect(result.params.activity_key).toBe('concept:name');

    // A deterministic hash must be emitted.
    expect(typeof result.hash).toBe('string');
    expect(result.hash.length).toBeGreaterThan(0);
  });

  it('kernel stats reflect one completed run after discovery', async () => {
    const logHandle = stub.load_eventlog_from_xes(XES_3_ACTIVITY);
    await kernel.run('dfg', logHandle);

    const stats = kernel.stats();
    expect(stats.initialized).toBe(true);
    expect(stats.totalRuns).toBe(1);
    expect(stats.activeHandles).toBe(1);
  });

  it('second call with same input returns cached result (cacheHits increments)', async () => {
    const logHandle = stub.load_eventlog_from_xes(XES_3_ACTIVITY);

    const first = await kernel.run('dfg', logHandle);
    const second = await kernel.run('dfg', logHandle);

    // Same handle + params → identical result from cache.
    expect(second.handle).toBe(first.handle);
    expect(second.hash).toBe(first.hash);

    const stats = kernel.stats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.totalRuns).toBe(1); // Cache hit does not increment totalRuns
  });
});

// ─── E2E-03: Edge Case Discovery ──────────────────────────────────────────────

describe('E2E-03: Edge Case Discovery', () => {
  let kernel: Kernel;
  let stub: ReturnType<typeof buildWasmStub>;

  beforeEach(async () => {
    stub = buildWasmStub();
    kernel = new Kernel(stub);
    await kernel.init();
  });

  it('handles single-event log gracefully — returns a valid dfg result', async () => {
    const logHandle = stub.load_eventlog_from_xes(XES_SINGLE_EVENT);

    // Must not throw — a one-event log is degenerate but lawful.
    const result = await kernel.run('dfg', logHandle);

    expect(result.outputType).toBe('dfg');
    expect(result.handle).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles empty log without throwing — returns a valid dfg result', async () => {
    const logHandle = stub.load_eventlog_from_xes(XES_EMPTY);

    // Empty logs produce a degenerate DFG (no arcs) but must not throw.
    const result = await kernel.run('dfg', logHandle);

    expect(result.outputType).toBe('dfg');
    expect(result.handle).toBeTruthy();
  });

  it('throws KernelError for an unknown algorithm name', async () => {
    const logHandle = stub.load_eventlog_from_xes(XES_3_ACTIVITY);

    await expect(
      kernel.run('no_such_algorithm_xyz', logHandle)
    ).rejects.toThrow('Algorithm not found');
  });

  it('throws when kernel.run() is called before init()', async () => {
    const uninitializedKernel = new Kernel(stub);
    const logHandle = stub.load_eventlog_from_xes(XES_3_ACTIVITY);

    await expect(uninitializedKernel.run('dfg', logHandle)).rejects.toThrow(
      'Kernel not initialized'
    );
  });
});
