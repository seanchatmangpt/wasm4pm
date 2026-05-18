/**
 * run-contracts.test.ts
 *
 * Contract tests for Kernel.run() and Kernel.stream().
 *
 * Oracle ranks (Van der Aalst / process mining Chicago TDD):
 *   Rank 1 — Mathematical theorem: KernelResult shape invariants, mutual exclusivity
 *   Rank 2 — Domain contract: unknown algorithm rejection, error message content,
 *             not-initialized guard, registry consistency
 *   Rank 3 — Metamorphic relation: algorithm isolation, handle reuse safety
 *
 * No real WASM binary is needed. All tests use a minimal KernelWasmModule stub
 * that tracks dispatch calls and returns deterministic synthetic handles.
 * This follows the same pattern as regression-fm1.test.ts and validation.test.ts.
 *
 * FM-5 note: We do NOT mock init.js. The Kernel class is exercised directly
 * through its TypeScript constructor, which is the correct unit under test here.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel, type KernelWasmModule, type KernelResult } from '../api.js';
import { KernelError, isKernelError } from '../errors.js';
import { getRegistry } from '../registry.js';
import { isOk, isErr, isError, ok, err } from '@wasm4pm/contracts';

// ─── WASM stub ───────────────────────────────────────────────────────────────
//
// Minimal stub that satisfies KernelWasmModule. Every dispatched algorithm
// returns a unique synthetic handle so tests can verify dispatch identity.
// A call counter per algorithm lets us assert that handle reuse does not cause
// a second WASM dispatch (cache hit) or, conversely, that distinct handles DO
// cause a second dispatch.

function buildStub(): KernelWasmModule & { callCounts: Record<string, number> } {
  const callCounts: Record<string, number> = {};
  function inc(name: string): void {
    callCounts[name] = (callCounts[name] ?? 0) + 1;
  }
  function handle(alg: string, logHandle: string): { handle: string } {
    inc(alg);
    return { handle: `${alg}_result_for_${logHandle}_call${callCounts[alg]}` };
  }

  const stub: KernelWasmModule = {
    async init() {},

    async discover_dfg(h, _k) { return handle('dfg', h); },
    async discover_dfg_simd(h, _k) { return handle('simd_dfg', h); },
    async extract_process_skeleton(h, _k, _f) { return handle('skeleton', h); },
    async discover_alpha_plus_plus(h, _k, _s) { return handle('alpha', h); },
    async discover_heuristic_miner(h, _k, _t) { return handle('heuristic', h); },
    async discover_inductive_miner(h, _k, _n) { return handle('inductive', h); },
    async discover_genetic_algorithm(h, _k, _p, _g) { return handle('genetic', h); },
    async discover_pso_algorithm(h, _k, _s, _i) { return handle('pso', h); },
    async discover_astar(h, _k, _m) { return handle('astar', h); },
    async discover_hill_climbing(h, _k, _m) { return handle('hill', h); },
    async discover_ilp_petri_net(h, _k) { return handle('ilp', h); },
    async discover_ant_colony(h, _k, _c, _i) { return handle('aco', h); },
    async discover_simulated_annealing(h, _k, _t, _c) { return handle('sa', h); },
    async discover_declare(h, _k, _s) { return handle('declare', h); },
    async discover_transition_system(h, _w, _d) { return handle('ts', h); },
    async discover_prefix_tree(h, _k) { return handle('pt', h); },
    async discover_causal_graph(h, _k, _m, _t) { return handle('cg', h); },
    async discover_performance_spectrum(h, _k, _t) { return handle('ps', h); },
    async discover_batches(h, _k, _t, _b) { return handle('batches', h); },
    async discover_correlation(h, _k, _t) { return handle('corr', h); },
    async generalization(h, _p, _k) { return handle('gen', h); },
    async reduce_petri_net(_p) { return handle('reduce', _p); },
    async wasm_compute_precision(h, _p, _k) { return handle('prec', h); },
    wasm_compute_simplicity(_p, _t, _a): number { inc('simplicity'); return 0.9; },
    async compute_optimal_alignments(h, _p, _k, _c) { return handle('align', h); },
    async measure_complexity(_p) { return handle('complexity', _p); },
    async from_pnml(_x) { return handle('pnml', _x); },
    async read_bpmn(_x) { return handle('bpmn', _x); },
    async powl_to_process_tree(_h) { return handle('powl2tree', _h); },
    async powl_to_yawl_string(_s): Promise<string> { inc('yawl'); return '{}'; },
    async play_out(_m, _n, _l) { return handle('playout', _m); },
    async monte_carlo_simulation(_l, _p, _r, _c) { return handle('montecarlo', _l); },
    extract_case_features(_h, _k, _t, _c): string { inc('case_feat'); return '{"traces":[]}'; },
    detect_drift(_h, _k, _w): string { inc('drift'); return '{"drifts":[]}'; },
    async discover_ocel_dfg(_h) { return handle('ocel_dfg', _h); },
    async discover_ocel_dfg_per_type(_h) { return handle('ocel_per', _h); },
    async discover_handover_network(h, _k) { return handle('handover', h); },
    async discover_working_together_network(h, _k) { return handle('wt', h); },
    delete_object(_h) { inc('delete'); },
    clear_all_objects() { inc('clear'); },
  };

  return Object.assign(stub, { callCounts });
}

// ─── Shared setup ─────────────────────────────────────────────────────────────

let kernel: Kernel;
let stub: ReturnType<typeof buildStub>;

beforeEach(async () => {
  stub = buildStub();
  kernel = new Kernel(stub);
  await kernel.init();
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 1 — Rank 1 (mathematical): KernelResult shape invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 1: KernelResult shape invariants (Rank 1 — mathematical)', () => {
  it('run() resolves to a KernelResult with all required fields', async () => {
    const result = await kernel.run('dfg', 'log_handle_1');

    // Every required field must be present and correctly typed.
    expect(typeof result.handle).toBe('string');
    expect(typeof result.algorithm).toBe('string');
    expect(typeof result.outputType).toBe('string');
    expect(typeof result.durationMs).toBe('number');
    expect(typeof result.execution_ms).toBe('number');
    expect(typeof result.hash).toBe('string');
    expect(typeof result.params).toBe('object');
    expect(result.params).not.toBeNull();
  });

  it('handle field is a non-empty string', async () => {
    const result = await kernel.run('dfg', 'log_handle_2');
    expect(result.handle.length).toBeGreaterThan(0);
  });

  it('hash field is a non-empty string', async () => {
    const result = await kernel.run('dfg', 'log_handle_3');
    expect(result.hash.length).toBeGreaterThan(0);
  });

  it('durationMs and execution_ms are non-negative numbers', async () => {
    const result = await kernel.run('dfg', 'log_handle_4');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.execution_ms).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.durationMs)).toBe(true);
    expect(Number.isFinite(result.execution_ms)).toBe(true);
  });

  it('algorithm field matches the algorithm name passed to run()', async () => {
    const result = await kernel.run('dfg', 'log_handle_5');
    expect(result.algorithm).toBe('dfg');
  });

  it('outputType matches registry metadata for the algorithm', async () => {
    const registry = getRegistry();
    const meta = registry.get('dfg')!;
    const result = await kernel.run('dfg', 'log_handle_6');
    expect(result.outputType).toBe(meta.outputType);
  });

  it('params object always includes activity_key', async () => {
    const result = await kernel.run('dfg', 'log_handle_7');
    expect(result.params).toHaveProperty('activity_key');
    expect(typeof result.params['activity_key']).toBe('string');
  });

  it('params.activity_key defaults to concept:name when not specified', async () => {
    const result = await kernel.run('dfg', 'log_handle_8');
    expect(result.params['activity_key']).toBe('concept:name');
  });

  it('params.activity_key reflects custom value passed in', async () => {
    const result = await kernel.run('dfg', 'log_handle_9', { activity_key: 'my:activity' });
    expect(result.params['activity_key']).toBe('my:activity');
  });

  it('contracts Result<T> type guards are mutually exclusive — ok/err/error cover all cases', () => {
    // Verify the @wasm4pm/contracts type guards are self-consistent (Rank 1 property).
    // These guards are used by callers that wrap kernel results in Result<T>.
    const success = ok('value');
    const failure = err('something went wrong');

    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(isError(success)).toBe(false);

    expect(isOk(failure)).toBe(false);
    expect(isErr(failure)).toBe(true);
    expect(isError(failure)).toBe(false);
  });

  it('isOk and isErr are mutually exclusive for any Result value', () => {
    const results = [ok(42), err('fail'), ok(null)] as const;
    for (const r of results) {
      const bothTrue = isOk(r) && isErr(r);
      const bothFalse = !isOk(r) && !isErr(r) && !isError(r);
      // At least one guard must be true; both cannot be true simultaneously.
      expect(bothTrue).toBe(false);
      expect(bothFalse).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2 — Rank 2 (domain contract): Unknown algorithm rejection
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 2: Unknown algorithm rejection (Rank 2 — domain contract)', () => {
  it('throws KernelError for a completely unknown algorithm name', async () => {
    await expect(kernel.run('completely-unknown-algorithm', 'handle', {}))
      .rejects.toThrow(KernelError);
  });

  it('throws with code ALGORITHM_NOT_FOUND for an unknown algorithm', async () => {
    let caughtError: KernelError | undefined;
    try {
      await kernel.run('completely-unknown-algorithm', 'handle', {});
    } catch (e) {
      caughtError = e as KernelError;
    }
    expect(caughtError).toBeDefined();
    expect(caughtError!.code).toBe('ALGORITHM_NOT_FOUND');
  });

  it('error message contains the algorithm name that was requested', async () => {
    let caughtError: KernelError | undefined;
    try {
      await kernel.run('completely-unknown-algorithm', 'handle', {});
    } catch (e) {
      caughtError = e as KernelError;
    }
    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toContain('completely-unknown-algorithm');
  });

  it('error message lists available algorithms (not a generic message)', async () => {
    let caughtError: KernelError | undefined;
    try {
      await kernel.run('not-a-real-algo', 'handle', {});
    } catch (e) {
      caughtError = e as KernelError;
    }
    // The message should name at least one real algorithm so the caller knows what is available.
    expect(caughtError!.message).toContain('dfg');
  });

  it('throws KernelError for an empty string algorithm name', async () => {
    await expect(kernel.run('', 'handle', {}))
      .rejects.toThrow(KernelError);
  });

  it('empty string algorithm error has code ALGORITHM_NOT_FOUND', async () => {
    let caughtError: KernelError | undefined;
    try {
      await kernel.run('', 'handle', {});
    } catch (e) {
      caughtError = e as KernelError;
    }
    expect(caughtError?.code).toBe('ALGORITHM_NOT_FOUND');
  });

  it('isKernelError type guard correctly identifies the thrown error', async () => {
    let caught: unknown;
    try {
      await kernel.run('no-such-algorithm', 'handle', {});
    } catch (e) {
      caught = e;
    }
    expect(isKernelError(caught)).toBe(true);
  });

  it('does NOT silently succeed — run() rejects the promise instead of returning a fallback result', async () => {
    // Verify the promise rejects rather than resolves to an error-shaped object.
    let resolved: KernelResult | undefined;
    let rejected = false;
    try {
      resolved = await kernel.run('not-a-real-algorithm', 'handle', {});
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(resolved).toBeUndefined();
  });

  it('error context includes the algorithmName that was passed', async () => {
    let caughtError: KernelError | undefined;
    try {
      await kernel.run('unknown-for-context-test', 'handle', {});
    } catch (e) {
      caughtError = e as KernelError;
    }
    expect(caughtError?.context).toMatchObject({ algorithmName: 'unknown-for-context-test' });
  });

  it('KernelError.name is "KernelError" (not generic "Error")', async () => {
    let caughtError: unknown;
    try {
      await kernel.run('bogus', 'handle', {});
    } catch (e) {
      caughtError = e;
    }
    expect((caughtError as Error).name).toBe('KernelError');
  });

  it('run() before init() throws KernelError with KERNEL_NOT_INITIALIZED', async () => {
    const uninitializedKernel = new Kernel(stub);
    let caughtError: KernelError | undefined;
    try {
      await uninitializedKernel.run('dfg', 'handle', {});
    } catch (e) {
      caughtError = e as KernelError;
    }
    expect(caughtError).toBeDefined();
    expect(isKernelError(caughtError)).toBe(true);
    expect(caughtError!.code).toBe('KERNEL_NOT_INITIALIZED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3 — Rank 2 (domain contract): Registry consistency
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 3: Registry consistency (Rank 2 — domain contract)', () => {
  it('every algorithm in the registry resolves to a non-empty id', () => {
    const registry = getRegistry();
    const all = registry.list();
    expect(all.length).toBeGreaterThan(0);
    for (const meta of all) {
      expect(typeof meta.id).toBe('string');
      expect(meta.id.length).toBeGreaterThan(0);
    }
  });

  it('registry.get(id) returns the same metadata as registry.list() for every algorithm', () => {
    const registry = getRegistry();
    const all = registry.list();
    for (const meta of all) {
      const fetched = registry.get(meta.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(meta.id);
      expect(fetched!.name).toBe(meta.name);
    }
  });

  it('registry.get() with unknown id returns undefined', () => {
    const registry = getRegistry();
    expect(registry.get('totally-unknown')).toBeUndefined();
    expect(registry.get('')).toBeUndefined();
  });

  it('all registered algorithm ids are unique', () => {
    const registry = getRegistry();
    const ids = registry.list().map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every registered algorithm has a non-empty name and description', () => {
    const registry = getRegistry();
    for (const meta of registry.list()) {
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it('every registered algorithm has a valid outputType', () => {
    const VALID_OUTPUT_TYPES = new Set(['dfg', 'petrinet', 'declare', 'tree', 'ml_result', 'analytics']);
    const registry = getRegistry();
    for (const meta of registry.list()) {
      expect(VALID_OUTPUT_TYPES.has(meta.outputType)).toBe(true);
    }
  });

  it('kernel.algorithm() mirrors registry.get() for known IDs', () => {
    const registry = getRegistry();
    const all = registry.list();
    for (const meta of all) {
      const kernelMeta = kernel.algorithm(meta.id);
      expect(kernelMeta).toBeDefined();
      expect(kernelMeta!.id).toBe(meta.id);
    }
  });

  it('kernel.algorithm() returns undefined for unknown IDs', () => {
    expect(kernel.algorithm('totally-unknown')).toBeUndefined();
    expect(kernel.algorithm('')).toBeUndefined();
  });

  it('kernel.algorithms() returns the same list as registry.list()', () => {
    const registry = getRegistry();
    const registryList = registry.list();
    const kernelList = kernel.algorithms();
    const registryIds = registryList.map((a) => a.id).sort();
    const kernelIds = kernelList.map((a) => a.id).sort();
    expect(kernelIds).toEqual(registryIds);
  });

  it('dfg algorithm is registered and accessible', () => {
    // dfg is the canonical baseline — if it is missing the kernel cannot function.
    const registry = getRegistry();
    const dfg = registry.get('dfg');
    expect(dfg).toBeDefined();
    expect(dfg!.outputType).toBe('dfg');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4 — Rank 3 (metamorphic): Algorithm isolation and handle reuse safety
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 4: Algorithm isolation and handle reuse (Rank 3 — metamorphic)', () => {
  it('two sequential run() calls with different algorithms do not interfere — handles differ', async () => {
    const handle = 'log_handle_isolation';

    const r1 = await kernel.run('dfg', handle);
    const r2 = await kernel.run('heuristic_miner', handle);

    // Outputs differ because different algorithms dispatched — not the same cached result.
    expect(r1.handle).not.toBe(r2.handle);
    expect(r1.algorithm).toBe('dfg');
    expect(r2.algorithm).toBe('heuristic_miner');
  });

  it('second run() with a different algorithm does not modify the first result', async () => {
    const logHandle = 'log_handle_isolation_2';

    const r1 = await kernel.run('dfg', logHandle);
    const r1HandleBefore = r1.handle;

    await kernel.run('heuristic_miner', logHandle);

    // r1.handle must still refer to the original dfg result.
    expect(r1.handle).toBe(r1HandleBefore);
    expect(r1.algorithm).toBe('dfg');
  });

  it('the event log handle is reusable — running dfg twice on the same handle succeeds', async () => {
    const logHandle = 'log_handle_reuse';

    const r1 = await kernel.run('dfg', logHandle);
    // Cache hit — same inputs → same result object.
    const r2 = await kernel.run('dfg', logHandle);

    // Both calls succeed (no exception means handle was not consumed).
    expect(r1.handle).toBe(r2.handle);
    expect(r1.hash).toBe(r2.hash);
  });

  it('running two different algorithms on the same handle both succeed', async () => {
    const logHandle = 'log_handle_multi_algo';

    // Neither call should throw — the handle is not consumed by the first dispatch.
    const r1 = await kernel.run('dfg', logHandle);
    const r2 = await kernel.run('alpha_plus_plus', logHandle);

    expect(r1.algorithm).toBe('dfg');
    expect(r2.algorithm).toBe('alpha_plus_plus');
  });

  it('hashes for different algorithms on the same log handle differ', async () => {
    const logHandle = 'log_handle_hash_diff';

    const r1 = await kernel.run('dfg', logHandle);
    const r2 = await kernel.run('heuristic_miner', logHandle);

    // The deterministic hash incorporates the algorithm name, so these must differ.
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('WASM is dispatched exactly once for the same algorithm+handle (cache hit on second call)', async () => {
    const logHandle = 'log_handle_cache_test';

    await kernel.run('dfg', logHandle);
    await kernel.run('dfg', logHandle);

    // The stub increments dfgCallCount per dispatch, not per run() call.
    // If caching works, the second run() hits the cache and dfgCallCount stays at 1.
    expect(stub.callCounts['dfg']).toBe(1);
  });

  it('WASM is dispatched again when the log handle changes', async () => {
    const logHandleA = 'log_handle_A';
    const logHandleB = 'log_handle_B';

    await kernel.run('dfg', logHandleA);
    await kernel.run('dfg', logHandleB);

    // Two distinct log handles → two WASM dispatches.
    expect(stub.callCounts['dfg']).toBe(2);
  });

  it('WASM is dispatched again when params differ for the same handle and algorithm', async () => {
    const logHandle = 'log_handle_params_diff';

    await kernel.run('dfg', logHandle, { activity_key: 'concept:name' });
    await kernel.run('dfg', logHandle, { activity_key: 'my:activity' });

    // Different params → different cache key → two WASM dispatches.
    expect(stub.callCounts['dfg']).toBe(2);
  });

  it('result.algorithm always matches the name passed to run() — not a default', async () => {
    const algorithms = ['dfg', 'heuristic_miner', 'inductive_miner'] as const;
    const logHandle = 'log_handle_alg_match';

    for (const alg of algorithms) {
      const result = await kernel.run(alg, logHandle);
      expect(result.algorithm).toBe(alg);
    }
  });

  it('stats().totalRuns increments after each successful run()', async () => {
    const before = kernel.stats().totalRuns;

    await kernel.run('dfg', 'log_a');
    await kernel.run('dfg', 'log_b');

    const after = kernel.stats().totalRuns;
    // Two dispatches happened (distinct log handles → no cache hit).
    expect(after).toBe(before + 2);
  });

  it('stats().cacheHits increments on a repeated run() with identical inputs', async () => {
    const logHandle = 'log_cache_hit_stats';

    // First call: WASM dispatch (no cache hit).
    await kernel.run('dfg', logHandle);
    const hitsBefore = kernel.stats().cacheHits;

    // Second call: cache hit.
    await kernel.run('dfg', logHandle);
    const hitsAfter = kernel.stats().cacheHits;

    expect(hitsAfter).toBe(hitsBefore + 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 5 — Rank 2 (domain contract): stream() contracts
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 5: stream() contracts (Rank 2 — domain contract)', () => {
  it('stream() yields at least one PartialResult before the final emission', async () => {
    const emissions: { progress: number; done: boolean }[] = [];
    for await (const partial of kernel.stream('dfg', 'log_handle_stream_1')) {
      emissions.push({ progress: partial.progress, done: partial.done });
    }
    expect(emissions.length).toBeGreaterThan(0);
  });

  it('the final emission from stream() has done:true and progress:1', async () => {
    let last: { progress: number; done: boolean; handle?: string } | undefined;
    for await (const partial of kernel.stream('dfg', 'log_handle_stream_2')) {
      last = partial;
    }
    expect(last).toBeDefined();
    expect(last!.done).toBe(true);
    expect(last!.progress).toBe(1);
  });

  it('the final stream() emission carries the result handle', async () => {
    let finalHandle: string | undefined;
    for await (const partial of kernel.stream('dfg', 'log_handle_stream_3')) {
      if (partial.done) {
        finalHandle = partial.handle;
      }
    }
    expect(typeof finalHandle).toBe('string');
    expect(finalHandle!.length).toBeGreaterThan(0);
  });

  it('stream() for an unknown algorithm rejects on the final step', async () => {
    let threw = false;
    try {
      for await (const _ of kernel.stream('completely-unknown-algorithm', 'log_handle_stream_err')) {
        // consume
      }
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('progress values in stream() emissions are between 0 and 1 (inclusive)', async () => {
    for await (const partial of kernel.stream('dfg', 'log_handle_stream_progress')) {
      expect(partial.progress).toBeGreaterThanOrEqual(0);
      expect(partial.progress).toBeLessThanOrEqual(1);
    }
  });

  it('non-final stream() emissions have done:false', async () => {
    const emissions: { done: boolean; progress: number }[] = [];
    for await (const partial of kernel.stream('dfg', 'log_handle_stream_done')) {
      emissions.push({ done: partial.done, progress: partial.progress });
    }
    // All emissions except the last must have done:false.
    for (const e of emissions.slice(0, -1)) {
      expect(e.done).toBe(false);
    }
  });
});
