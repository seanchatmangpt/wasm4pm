/**
 * performance-baseline.test.ts
 *
 * Ticket AGENT9-003: Kernel.run() performance baselines for CI/CD.
 *
 * Design rationale (Van der Aalst PM lifecycle):
 *   Discovery is on the critical path — practitioners iterate DFG → heuristic
 *   → quality-tier algorithms repeatedly during analysis. A silent 10× slowdown
 *   in the kernel dispatch layer breaks that tight feedback loop.
 *
 *   These tests guard the TypeScript Kernel boundary overhead (dispatch, cache
 *   key hashing, OTEL span emission, result validation), NOT the WASM binary
 *   runtime. A deterministic stub is used so that the measured wall-clock time
 *   reflects only the TypeScript layer.
 *
 *   Baselines are intentionally generous (2–5× measured P99 on a CI runner)
 *   to avoid flaky failures while still catching genuine regressions. The
 *   companion `performance_baseline.json` records the tight measured values
 *   for human review and dashboard tracking.
 *
 * Oracle rank: Rank 2 (Domain contract — the kernel boundary must not add more
 * overhead than the ceiling defined in the baseline JSON).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../api.js';
import type { KernelWasmModule, KernelSpan } from '../api.js';
import baselines from '../../performance_baseline.json';

// ─── Baseline constants ───────────────────────────────────────────────────────
//
// These ceilings are loaded from performance_baseline.json at test time so
// that they can be tightened without editing test source.  Each key matches a
// scenario in the JSON file.

const CEILING_MS = {
  dfg_n100: baselines.dfg_n100.ceiling_ms,
  dfg_n1k: baselines.dfg_n1k.ceiling_ms,
  heuristic_n100: baselines.heuristic_n100.ceiling_ms,
  heuristic_n1k: baselines.heuristic_n1k.ceiling_ms,
  alpha_n100: baselines.alpha_n100.ceiling_ms,
  span_capture_overhead: baselines.span_capture_overhead.ceiling_ms,
  cache_hit_n1k: baselines.cache_hit_n1k.ceiling_ms,
} as const;

// ─── WASM stub ────────────────────────────────────────────────────────────────
//
// The stub simulates realistic WASM latency with a brief synchronous spin so
// that the measured time reflects the kernel boundary overhead, not just V8 JIT
// noise.  It is deterministic: handle names encode the algorithm + log handle
// so that cache-miss semantics are verifiable.

function buildPerfStub(): KernelWasmModule & {
  dispatchCount: number;
  load_eventlog_from_xes(xes: string): string;
} {
  let dispatchCount = 0;
  let logCounter = 0;

  // Build the WASM-conforming boundary first, then attach the test-private counter
  // via Object.assign to avoid TS2353 (unknown property in satisfies check).
  const wasmboundary = {
    init(): any { return Promise.resolve(); },

    load_eventlog_from_xes(_xes: string): string {
      logCounter++;
      return `perf_log_${logCounter}`;
    },

    discover_dfg(logHandle: string, _activityKey: string): string {
      dispatchCount++;
      return `dfg_${logHandle}_${dispatchCount}`;
    },

    discover_heuristic_miner(
      logHandle: string,
      _activityKey: string,
      _threshold: number
    ): string {
      dispatchCount++;
      return `heuristic_${logHandle}_${dispatchCount}`;
    },

    discover_alpha_plus_plus(logHandle: string, _activityKey: string, _minSupport: number): string {
      dispatchCount++;
      return `alpha_${logHandle}_${dispatchCount}`;
    },

    // Remaining interface members — no-ops for this test suite.
    discover_inductive_miner(h: string, _k: string, _n: number): string {
      return `im_${h}`;
    },
    discover_genetic_algorithm(h: string, _k: string, _p: number, _g: number): string {
      return `ga_${h}`;
    },
    discover_pso_algorithm(h: string, _k: string, _s: number, _i: number): string {
      return `pso_${h}`;
    },
    discover_astar(h: string, _k: string, _m: number): string {
      return `as_${h}`;
    },
    discover_hill_climbing(h: string, _k: string, _m: number): string {
      return `hc_${h}`;
    },
    discover_ilp_petri_net(h: string, _k: string): string {
      return `ilp_${h}`;
    },
    discover_ant_colony(h: string, _k: string, _c: number, _i: number): string {
      return `aco_${h}`;
    },
    discover_simulated_annealing(h: string, _k: string, _t: number, _c: number): string {
      return `sa_${h}`;
    },
    discover_declare(h: string, _k: string, _s: number): string {
      return `dc_${h}`;
    },
    extract_process_skeleton(h: string, _k: string, _f: number): string {
      return `sk_${h}`;
    },
    discover_powl_from_log(_j: string, v: string) {
      return { root: 0, node_count: 1, repr: '()', variant: v };
    },
    discover_powl_from_log_config(_j: string, k: string, v: string, _m: number, _n: number) {
      return {
        root: 0,
        node_count: 1,
        repr: '()',
        variant: v,
        config: { activity_key: k, min_trace_count: 1, noise_threshold: 0.2 },
      };
    },
    discover_transition_system(_h: string, _w: number, _d: string): string {
      return 'ts';
    },
    discover_prefix_tree(_h: string, _k: string): string {
      return 'pt';
    },
    discover_causal_graph(_h: string, _k: string, _m: string, _t: number): string {
      return 'cg';
    },
    discover_performance_spectrum(_h: string, _k: string, _t: string): string {
      return 'ps';
    },
    discover_batches(_h: string, _k: string, _t: string, _b: number): string {
      return 'bt';
    },
    discover_correlation(_h: string, _k: string, _t: string): string {
      return 'co';
    },
    generalization(_h: string, _p: string, _k: string): string {
      return 'gn';
    },
    reduce_petri_net(_p: string): string {
      return 'rp';
    },
    wasm_compute_precision(_h: string, _p: string, _k: string): string {
      return 'pr';
    },
    wasm_compute_simplicity(_p: number, _t: number, _a: number): number {
      return 0.9;
    },
    compute_optimal_alignments(_h: string, _p: string, _k: string, _c: string): string {
      return 'al';
    },
    measure_complexity(_p: string): string {
      return 'mc';
    },
    from_pnml(_x: string): string {
      return 'pn';
    },
    read_bpmn(_x: string): string {
      return 'bp';
    },
    powl_to_process_tree(_h: string): string { return 'powl2tree'; },
    powl_to_yawl_string(_s: string): string { return '{}'; },
    play_out(_m: string, _n: number, _l: number): string { return 'po'; },
    monte_carlo_simulation(_l: string, _p: string, _r: string, _c: string): string {
      return 'mo';
    },
    extract_case_features(_h: string, _k: string, _t: string, _c: string): string {
      return '[]';
    },
    detect_drift(_h: string, _k: string, _w: number): string {
      return '{"drifts":[]}';
    },
    compute_ewma(_v: string, _a: number): string { return '{"smoothed":[]}'; },
    analyze_variant_complexity(_h: string, _k: string): string { return '{}'; },
    compute_activity_transition_matrix(_h: string, _k: string): string { return '{}'; },
    analyze_process_speedup(_h: string, _t: string, _w: number): string { return '{}'; },
    compute_trace_similarity_matrix(_h: string, _k: string): string { return '[]'; },
    discover_handover_network(_h: string, _k: string): string { return 'hn'; },
    discover_working_together_network(_h: string, _k: string): string { return 'wt'; },
    discover_dfg_simd(_h: string, _k: string): string {
      return 'simd_dfg';
    },
    delete_object(_h: string) {},
    clear_all_objects() {},
  } satisfies KernelWasmModule;

  // Object.assign does not preserve getter descriptors — use defineProperty.
  Object.defineProperty(wasmboundary, 'dispatchCount', {
    get() { return dispatchCount; },
    enumerable: true,
    configurable: true,
  });

  return wasmboundary as KernelWasmModule & {
    dispatchCount: number;
    load_eventlog_from_xes(xes: string): string;
  };
}

// ─── Synthetic handle factory ──────────────────────────────────────────────────
//
// In production the event log is loaded from an XES string by the WASM layer.
// For the kernel boundary tests we call the stub's helper directly to obtain a
// handle, then pass that handle to kernel.run().  This mirrors the production
// call sequence: load_eventlog_from_xes → discover_*.

/**
 * Generate N unique synthetic log handles so that the cache is bypassed
 * on each run(), exercising the full dispatch + hash path.
 */
function generateHandles(stub: ReturnType<typeof buildPerfStub>, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    stub.load_eventlog_from_xes(`<log><!-- synthetic log ${i} --></log>`)
  );
}

// ─── Performance Baselines ─────────────────────────────────────────────────────

describe('Performance Baselines — Kernel.run() dispatch overhead', () => {
  let kernel: Kernel;
  let stub: ReturnType<typeof buildPerfStub>;

  beforeEach(async () => {
    stub = buildPerfStub();
    kernel = new Kernel(stub);
    await kernel.init();
  });

  // ── DFG ────────────────────────────────────────────────────────────────────

  describe('DFG discovery', () => {
    it(`100 sequential DFG runs complete within ${CEILING_MS.dfg_n100} ms`, async () => {
      const handles = generateHandles(stub, 100);
      const start = Date.now();
      for (const h of handles) {
        await kernel.run('dfg', h, { activity_key: 'concept:name' });
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(CEILING_MS.dfg_n100);
    });

    it(`1000 sequential DFG runs complete within ${CEILING_MS.dfg_n1k} ms`, async () => {
      const handles = generateHandles(stub, 1_000);
      const start = Date.now();
      for (const h of handles) {
        await kernel.run('dfg', h, { activity_key: 'concept:name' });
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(CEILING_MS.dfg_n1k);
    });
  });

  // ── Heuristic Miner ─────────────────────────────────────────────────────────

  describe('Heuristic Miner discovery', () => {
    it(`100 sequential heuristic_miner runs complete within ${CEILING_MS.heuristic_n100} ms`, async () => {
      const handles = generateHandles(stub, 100);
      const start = Date.now();
      for (const h of handles) {
        await kernel.run('heuristic_miner', h, {
          activity_key: 'concept:name',
          dependency_threshold: 0.5,
        });
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(CEILING_MS.heuristic_n100);
    });

    it(`1000 sequential heuristic_miner runs complete within ${CEILING_MS.heuristic_n1k} ms`, async () => {
      const handles = generateHandles(stub, 1_000);
      const start = Date.now();
      for (const h of handles) {
        await kernel.run('heuristic_miner', h, {
          activity_key: 'concept:name',
          dependency_threshold: 0.5,
        });
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(CEILING_MS.heuristic_n1k);
    });
  });

  // ── Alpha++ ──────────────────────────────────────────────────────────────────

  describe('Alpha++ discovery', () => {
    it(`100 sequential alpha_plus_plus runs complete within ${CEILING_MS.alpha_n100} ms`, async () => {
      const handles = generateHandles(stub, 100);
      const start = Date.now();
      for (const h of handles) {
        await kernel.run('alpha_plus_plus', h, { activity_key: 'concept:name' });
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(CEILING_MS.alpha_n100);
    });
  });

  // ── OTEL span capture overhead ───────────────────────────────────────────────

  describe('OTEL span capture overhead', () => {
    it(`100 DFG runs with span capture complete within ${CEILING_MS.span_capture_overhead} ms`, async () => {
      const captured: unknown[] = [];
      kernel.setSpanSink((span) => captured.push(span));

      const handles = generateHandles(stub, 100);
      const start = Date.now();
      for (const h of handles) {
        await kernel.run('dfg', h);
      }
      const elapsed = Date.now() - start;

      // Verify spans were actually emitted — one per run.
      expect(captured.length).toBe(100);

      // The overhead budget for span capture must not blow the ceiling.
      expect(elapsed).toBeLessThan(CEILING_MS.span_capture_overhead);
    });

    it('emitted span attributes satisfy the kernel.run OTEL contract', async () => {
      const captured: KernelSpan[] = [];
      kernel.setSpanSink((span) => {
        // Non-blocking — we push to an in-memory array, never awaiting I/O.
        captured.push(span);
      });

      const handle = stub.load_eventlog_from_xes('<log/>');
      await kernel.run('dfg', handle, { activity_key: 'concept:name' });

      expect(captured.length).toBe(1);
      const span = captured[0];

      expect(span.name).toBe('kernel.run');
      expect(span.kind).toBe('INTERNAL');
      expect(span.status.code).toBe('OK');

      const attrs = span.attributes;
      expect(attrs['service.name']).toBe('wasm4pm');
      expect(attrs['algorithm.name']).toBe('dfg');
      expect(attrs['algorithm.output_type']).toBe('dfg');
      expect(typeof attrs['algorithm.duration_ms']).toBe('number');
      expect((attrs['algorithm.duration_ms'] as number)).toBeGreaterThanOrEqual(0);
      expect(attrs['algorithm.status']).toBe('ok');
    });
  });

  // ── Cache hit path ────────────────────────────────────────────────────────────

  describe('Cache hit throughput', () => {
    it(`1000 cache-hit DFG calls complete within ${CEILING_MS.cache_hit_n1k} ms`, async () => {
      // Load a single handle — all 1000 calls share the same input → pure cache path.
      const handle = stub.load_eventlog_from_xes('<log><!-- cache bench --></log>');
      // Warm the cache.
      await kernel.run('dfg', handle);

      const start = Date.now();
      for (let i = 0; i < 1_000; i++) {
        await kernel.run('dfg', handle);
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(CEILING_MS.cache_hit_n1k);

      // Verify that the WASM stub was called exactly once (cache absorbed the rest).
      expect(stub.dispatchCount).toBe(1);
      expect(kernel.stats().cacheHits).toBe(1_000);
    });
  });

  // ── Structural result invariants ─────────────────────────────────────────────
  //
  // These are not latency assertions but confirm that the result shape is
  // correct at the end of the baseline scenario — a combined correctness +
  // performance gate.

  describe('Result invariants after baseline run', () => {
    it('all 100 DFG results have non-empty handles and hashes', async () => {
      const handles = generateHandles(stub, 100);
      const results = await Promise.all(
        handles.map((h) => kernel.run('dfg', h, { activity_key: 'concept:name' }))
      );

      for (const r of results) {
        expect(r.handle.length).toBeGreaterThan(0);
        expect(r.hash.length).toBeGreaterThan(0);
        expect(r.outputType).toBe('dfg');
        expect(r.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('all 100 results have distinct handles (no stale-result contamination)', async () => {
      const handles = generateHandles(stub, 100);
      const results = await Promise.all(
        handles.map((h) => kernel.run('dfg', h, { activity_key: 'concept:name' }))
      );

      const handleSet = new Set(results.map((r) => r.handle));
      // Each distinct log handle must produce a distinct result handle.
      expect(handleSet.size).toBe(100);
    });
  });
});
