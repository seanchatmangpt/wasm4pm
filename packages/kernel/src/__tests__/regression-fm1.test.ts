/**
 * regression-fm1.test.ts
 *
 * FM-1 Regression: Stale-result guard for sequential kernel.run() calls.
 *
 * Bug description (FM-1):
 *   When the WASM algorithm dispatcher used `next_state == state` in a
 *   Bellman-style update, the Q-table became self-referential.  The analogous
 *   risk in the Kernel boundary is that two sequential `run()` calls with
 *   *different* event logs but the *same* algorithm could return the same
 *   cached result if the cache key is mis-computed (e.g., only hashing the
 *   algorithm name rather than also hashing the log handle).
 *
 * This test constructs two distinct log handles, runs 'dfg' on each, and
 * verifies that:
 *   1. The returned handles differ — the WASM stub dispatched two distinct calls.
 *   2. The result hashes differ — the deterministic hash includes the log handle.
 *   3. The Kernel's cache does not serve the first result for the second input.
 *
 * Oracle rank: Rank 1 (Mathematical identity — different inputs must produce
 * different cache keys by the pigeonhole principle of the hash function).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../api.js';
import type { KernelWasmModule } from '../api.js';

// ─── Minimal WASM stub ───────────────────────────────────────────────────────

/**
 * The stub tracks dispatch calls so we can assert the kernel did NOT
 * short-circuit to a cached result.
 */
function buildFm1Stub(): KernelWasmModule & {
  dfgCallCount: number;
  load_eventlog_from_xes(xes: string): string;
} {
  let dfgCallCount = 0;
  let logHandleCounter = 0;

  // Build the WASM-conforming boundary first, then attach the test-private counter
  // via Object.assign to avoid TS2353 (unknown property in satisfies check).
  const wasmboundary = {
    init(): any { return Promise.resolve(); },

    // XES loading helper invoked directly in tests.
    load_eventlog_from_xes(_xes: string): string {
      logHandleCounter++;
      return `log_handle_${logHandleCounter}`;
    },

    // Each call returns a handle that encodes the input log handle — this makes
    // it possible to distinguish which log the discovery ran against.
    discover_dfg(logHandle: string, _activityKey: string): string {
      dfgCallCount++;
      return `dfg_for_${logHandle}_call_${dfgCallCount}`;
    },

    // Remaining interface members satisfied with no-ops.
    discover_alpha_plus_plus(h: string, _k: string, _m: number): string { return `ap_${h}`; },
    discover_heuristic_miner(h: string, _k: string, _t: number): string { return `hm_${h}`; },
    discover_inductive_miner(h: string, _k: string, _n: number): string { return `im_${h}`; },
    discover_genetic_algorithm(h: string, _k: string, _p: number, _g: number): string { return `ga_${h}`; },
    discover_pso_algorithm(h: string, _k: string, _s: number, _i: number): string { return `pso_${h}`; },
    discover_astar(h: string, _k: string, _m: number): string { return `as_${h}`; },
    discover_hill_climbing(h: string, _k: string, _m: number): string { return `hc_${h}`; },
    discover_ilp_petri_net(h: string, _k: string): string { return `ilp_${h}`; },
    discover_ant_colony(h: string, _k: string, _c: number, _i: number): string { return `aco_${h}`; },
    discover_simulated_annealing(h: string, _k: string, _t: number, _c: number): string { return `sa_${h}`; },
    discover_declare(h: string, _k: string, _s: number): string { return `dc_${h}`; },
    extract_process_skeleton(h: string, _k: string, _f: number): string { return `sk_${h}`; },
    discover_powl_from_log(_j: string, v: string) { return { root: 0, node_count: 1, repr: '()', variant: v }; },
    discover_powl_from_log_config(_j: string, k: string, v: string, _m: number, _n: number) {
      return { root: 0, node_count: 1, repr: '()', variant: v, config: { activity_key: k, min_trace_count: 1, noise_threshold: 0.2 } };
    },
    discover_transition_system(_h: string, _w: number, _d: string): string { return 'ts'; },
    discover_prefix_tree(_h: string, _k: string): string { return 'pt'; },
    discover_causal_graph(_h: string, _k: string, _m: string, _t: number): string { return 'cg'; },
    discover_performance_spectrum(_h: string, _k: string, _t: string): string { return 'ps'; },
    discover_batches(_h: string, _k: string, _t: string, _b: number): string { return 'bt'; },
    discover_correlation(_h: string, _k: string, _t: string): string { return 'co'; },
    generalization(_h: string, _p: string, _k: string): string { return 'gn'; },
    reduce_petri_net(_p: string): string { return 'rp'; },
    wasm_compute_precision(_h: string, _p: string, _k: string): string { return 'pr'; },
    wasm_compute_simplicity(_p: number, _t: number, _a: number): number { return 0.9; },
    compute_optimal_alignments(_h: string, _p: string, _k: string, _c: string): string { return 'al'; },
    measure_complexity(_p: string): string { return 'mc'; },
    from_pnml(_x: string): string { return 'pn'; },
    read_bpmn(_x: string): string { return 'bp'; },
    powl_to_process_tree(_h: string): string { return 'tr'; },
    powl_to_yawl_string(_s: string): string { return '{}'; },
    play_out(_m: string, _n: number, _l: number): string { return 'po'; },
    monte_carlo_simulation(_l: string, _p: string, _r: string, _c: string): string { return 'mo'; },
    extract_case_features(_h: string, _k: string, _t: string, _c: string): string { return '[]'; },
    detect_drift(_h: string, _k: string, _w: number): string { return '{"drifts":[]}'; },
    compute_ewma(_v: string, _a: number): string { return '{"smoothed":[]}'; },
    analyze_variant_complexity(_h: string, _k: string): string { return '{}'; },
    compute_activity_transition_matrix(_h: string, _k: string): string { return '{}'; },
    analyze_process_speedup(_h: string, _t: string, _w: number): string { return '{}'; },
    compute_trace_similarity_matrix(_h: string, _k: string): string { return '[]'; },
    discover_ocel_dfg(_h: string): string { return 'ocel'; },
    discover_ocel_dfg_per_type(_h: string): string { return 'ocel_per'; },
    discover_handover_network(_h: string, _k: string): string { return 'hn'; },
    discover_working_together_network(_h: string, _k: string): string { return 'wt'; },
    delete_object(_h: string) {},
    clear_all_objects() {},
  };

  // Object.assign does not preserve getter descriptors — use defineProperty.
  Object.defineProperty(wasmboundary, 'dfgCallCount', {
    get() { return dfgCallCount; },
    enumerable: true,
    configurable: true,
  });

  return wasmboundary as KernelWasmModule & {
    dfgCallCount: number;
    load_eventlog_from_xes(xes: string): string;
  };
}

// ─── FM-1 Regression Tests ────────────────────────────────────────────────────

describe('FM-1 Regression: Sequential kernel.run() calls with different logs', () => {
  let kernel: Kernel;
  let stub: ReturnType<typeof buildFm1Stub>;

  beforeEach(async () => {
    stub = buildFm1Stub();
    kernel = new Kernel(stub);
    await kernel.init();
  });

  it('two distinct log handles produce two distinct result handles', async () => {
    const handle1 = stub.load_eventlog_from_xes('<log><!-- log 1 --></log>');
    const handle2 = stub.load_eventlog_from_xes('<log><!-- log 2 --></log>');

    // Handles must differ — they represent different WASM memory objects.
    expect(handle1).not.toBe(handle2);

    const result1 = await kernel.run('dfg', handle1, { activity_key: 'concept:name' });
    const result2 = await kernel.run('dfg', handle2, { activity_key: 'concept:name' });

    // Result handles must differ — the stub encodes the input log handle in the
    // output, so identical handles would prove the kernel returned a stale result.
    expect(result1.handle).not.toBe(result2.handle);
  });

  it('two distinct log handles produce two distinct result hashes', async () => {
    const handle1 = stub.load_eventlog_from_xes('<log><!-- log A --></log>');
    const handle2 = stub.load_eventlog_from_xes('<log><!-- log B --></log>');

    const result1 = await kernel.run('dfg', handle1);
    const result2 = await kernel.run('dfg', handle2);

    // Hashes must differ — the deterministic hash incorporates the log handle.
    // Identical hashes would signal that the cache key missed the log identity.
    expect(result1.hash).not.toBe(result2.hash);
  });

  it('WASM is called once per distinct log handle — cache is not reused across handles', async () => {
    const handle1 = stub.load_eventlog_from_xes('<log><!-- log X --></log>');
    const handle2 = stub.load_eventlog_from_xes('<log><!-- log Y --></log>');

    await kernel.run('dfg', handle1);
    await kernel.run('dfg', handle2);

    // The WASM stub must have been dispatched twice — once per distinct input.
    // If the cache incorrectly matched across log handles, dfgCallCount would be 1.
    expect(stub.dfgCallCount).toBe(2);
  });

  it('same log handle called twice incurs only one WASM dispatch (cache hit)', async () => {
    const handle = stub.load_eventlog_from_xes('<log><!-- single log --></log>');

    const r1 = await kernel.run('dfg', handle);
    const r2 = await kernel.run('dfg', handle);

    // Cached result — WASM dispatched only once.
    expect(stub.dfgCallCount).toBe(1);

    // Both calls return the same result.
    expect(r1.handle).toBe(r2.handle);
    expect(r1.hash).toBe(r2.hash);

    const stats = kernel.stats();
    expect(stats.cacheHits).toBe(1);
  });

  it('result algorithm field always reflects the requested algorithm', async () => {
    const handle1 = stub.load_eventlog_from_xes('<log><!-- log P --></log>');
    const handle2 = stub.load_eventlog_from_xes('<log><!-- log Q --></log>');

    const result1 = await kernel.run('dfg', handle1);
    const result2 = await kernel.run('dfg', handle2);

    // Both must report the algorithm that was requested, not a stale value.
    expect(result1.algorithm).toBe('dfg');
    expect(result2.algorithm).toBe('dfg');
  });
});
