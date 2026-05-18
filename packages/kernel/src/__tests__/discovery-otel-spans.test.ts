/**
 * discovery-otel-spans.test.ts
 *
 * Cycle 51 Agent 3: OTEL Span Coverage for Discovery Algorithms
 *
 * Verifies that all 15 core discovery algorithms emit OTEL spans with correct
 * attributes. This test suite provides coverage across:
 *
 * Fast tier (3):      dfg, process_skeleton, simd_streaming_dfg
 * Balanced tier (5):  alpha_plus_plus, heuristic_miner, inductive_miner,
 *                     hill_climbing, declare
 * Quality tier (7):   simulated_annealing, a_star, aco, pso, genetic_algorithm,
 *                     optimized_dfg, ilp
 *
 * Oracle rank: Rank 2 (Domain contract — every discovery algorithm must emit
 * an OTEL span with algorithm name, duration, output type, and status).
 *
 * No real WASM binary needed — uses a minimal deterministic stub that tracks
 * dispatch calls and returns synthetic handles.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel, type KernelWasmModule, type KernelSpan } from '../api.js';

// ─── WASM stub ────────────────────────────────────────────────────────────────

function buildDiscoveryStub(): KernelWasmModule & { dispatchCount: number } {
  let dispatchCount = 0;

  const stub: KernelWasmModule = {
    async init() {},

    // ─── Fast tier (3 algorithms) ─────────────────────────────────────────
    async discover_dfg(h: string, _k: string) {
      dispatchCount++;
      return { handle: `dfg_${h}_${dispatchCount}` };
    },

    async extract_process_skeleton(h: string, _k: string, _f: number) {
      dispatchCount++;
      return { handle: `skeleton_${h}_${dispatchCount}` };
    },

    async discover_dfg_simd(h: string, _k: string) {
      dispatchCount++;
      return { handle: `simd_${h}_${dispatchCount}` };
    },

    // ─── Balanced tier (5 algorithms) ─────────────────────────────────────
    async discover_alpha_plus_plus(h: string, _k: string, _s: number) {
      dispatchCount++;
      return { handle: `alpha_${h}_${dispatchCount}` };
    },

    async discover_heuristic_miner(h: string, _k: string, _t: number) {
      dispatchCount++;
      return { handle: `heuristic_${h}_${dispatchCount}` };
    },

    async discover_inductive_miner(h: string, _k: string, _n: number) {
      dispatchCount++;
      return { handle: `inductive_${h}_${dispatchCount}` };
    },

    async discover_hill_climbing(h: string, _k: string, _m: number) {
      dispatchCount++;
      return { handle: `hill_${h}_${dispatchCount}` };
    },

    async discover_declare(h: string, _k: string, _s: number) {
      dispatchCount++;
      return { handle: `declare_${h}_${dispatchCount}` };
    },

    // ─── Quality tier (7 algorithms) ──────────────────────────────────────
    async discover_simulated_annealing(h: string, _k: string, _t: number, _c: number) {
      dispatchCount++;
      return { handle: `sa_${h}_${dispatchCount}` };
    },

    async discover_astar(h: string, _k: string, _m: number) {
      dispatchCount++;
      return { handle: `astar_${h}_${dispatchCount}` };
    },

    async discover_ant_colony(h: string, _k: string, _c: number, _i: number) {
      dispatchCount++;
      return { handle: `aco_${h}_${dispatchCount}` };
    },

    async discover_pso_algorithm(h: string, _k: string, _s: number, _i: number) {
      dispatchCount++;
      return { handle: `pso_${h}_${dispatchCount}` };
    },

    async discover_genetic_algorithm(h: string, _k: string, _p: number, _g: number) {
      dispatchCount++;
      return { handle: `genetic_${h}_${dispatchCount}` };
    },

    // Note: optimized_dfg dispatches to discover_dfg internally in api.ts
    // so it doesn't need a separate WASM export.

    async discover_ilp_petri_net(h: string, _k: string) {
      dispatchCount++;
      return { handle: `ilp_${h}_${dispatchCount}` };
    },

    // ─── Additional required stubs ────────────────────────────────────────
    // These are called by other parts of the kernel and must exist.
    // They don't need comprehensive testing here.

    async discover_transition_system(h: string, _w: number, _d: string) {
      return { handle: `ts_${h}` };
    },
    async discover_prefix_tree(h: string, _k: string) {
      return { handle: `pt_${h}` };
    },
    async discover_causal_graph(h: string, _k: string, _m: string, _t: number) {
      return { handle: `cg_${h}` };
    },
    async discover_performance_spectrum(h: string, _k: string, _t: string) {
      return { handle: `ps_${h}` };
    },
    async discover_batches(h: string, _k: string, _t: string, _b: number) {
      return { handle: `batches_${h}` };
    },
    async discover_correlation(h: string, _k: string, _t: string) {
      return { handle: `corr_${h}` };
    },
    async generalization(h: string, _p: string, _k: string) {
      return { handle: `gen_${h}` };
    },
    async reduce_petri_net(_p: string) {
      return { handle: `reduce_${_p}` };
    },
    async wasm_compute_precision(h: string, _p: string, _k: string) {
      return { handle: `prec_${h}` };
    },
    wasm_compute_simplicity(_p: number, _t: number, _a: number): number {
      return 0.9;
    },
    async compute_optimal_alignments(h: string, _p: string, _k: string, _c: string) {
      return { handle: `align_${h}` };
    },
    async measure_complexity(_p: string) {
      return { handle: `complexity_${_p}` };
    },
    async from_pnml(_x: string) {
      return { handle: `pnml_${_x}` };
    },
    async read_bpmn(_x: string) {
      return { handle: `bpmn_${_x}` };
    },
    async powl_to_process_tree(_h: string) {
      return { handle: `powl2tree_${_h}` };
    },
    async powl_to_yawl_string(_s: string): Promise<string> {
      return '{}';
    },
    async play_out(_m: string, _n: number, _l: number) {
      return { handle: `playout_${_m}` };
    },
    async monte_carlo_simulation(_l: string, _p: string, _r: string, _c: string) {
      return { handle: `montecarlo_${_l}` };
    },
    extract_case_features(_h: string, _k: string, _t: string, _c: string): string {
      return '{"traces":[]}';
    },
    detect_drift(_h: string, _k: string, _w: number): string {
      return '{"drifts":[]}';
    },
    predict_next_activity(_h: string, _k: string, _n: number): string {
      return '{"predictions":[]}';
    },
    predict_case_duration(_h: string, _k: string): string {
      return '{"durations":[]}';
    },
    score_trace_anomaly(_h: string): string {
      return '{"scores":[]}';
    },
    async discover_handover_network(h: string, _r: string) {
      return { handle: `handover_${h}` };
    },
    async discover_working_together_network(h: string, _r: string) {
      return { handle: `wt_${h}` };
    },
  } as unknown as KernelWasmModule;

  return Object.assign(stub, { dispatchCount });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Discovery Algorithm OTEL Span Emission (Cycle 51 Agent 3)', () => {
  let kernel: Kernel;
  let stub: KernelWasmModule & { dispatchCount: number };
  let captures: KernelSpan[];

  beforeEach(async () => {
    stub = buildDiscoveryStub();
    kernel = new Kernel(stub);
    await kernel.init();
    captures = [];
    kernel.setSpanSink((span) => captures.push(span));
  });

  // ─── Fast Tier Tests ──────────────────────────────────────────────────────

  describe('Fast tier algorithms', () => {
    it('DFG emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_dfg_test';
      await kernel.run('dfg', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.name).toBe('kernel.run');
      expect(span.kind).toBe('INTERNAL');
      expect(span.status.code).toBe('OK');
      expect(span.attributes['algorithm.name']).toBe('dfg');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(typeof span.attributes['algorithm.duration_ms']).toBe('number');
      expect(span.attributes['algorithm.duration_ms']).toBeGreaterThanOrEqual(0);
      expect(span.attributes['service.name']).toBe('wasm4pm');
      expect(span.attributes['kernel.version']).toBeDefined();
      expect(span.attributes['algorithm.handle']).toBeDefined();
      expect(span.attributes['algorithm.hash']).toBeDefined();
      expect(span.start_time).toBeGreaterThan(0);
      expect(span.end_time).toBeGreaterThan(span.start_time);
    });

    it('Process Skeleton emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_skeleton_test';
      await kernel.run('process_skeleton', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('process_skeleton');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('SIMD Streaming DFG emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_simd_test';
      await kernel.run('simd_streaming_dfg', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('simd_streaming_dfg');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });
  });

  // ─── Balanced Tier Tests ──────────────────────────────────────────────────

  describe('Balanced tier algorithms', () => {
    it('Alpha Plus Plus emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_alpha_test';
      await kernel.run('alpha_plus_plus', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('alpha_plus_plus');
      expect(span.attributes['algorithm.output_type']).toBe('petrinet');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('Heuristic Miner emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_heuristic_test';
      await kernel.run('heuristic_miner', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('heuristic_miner');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('Inductive Miner emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_inductive_test';
      await kernel.run('inductive_miner', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('inductive_miner');
      expect(span.attributes['algorithm.output_type']).toBe('tree');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('Hill Climbing emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_hill_test';
      await kernel.run('hill_climbing', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('hill_climbing');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('Declare emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_declare_test';
      await kernel.run('declare', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('declare');
      expect(span.attributes['algorithm.output_type']).toBe('declare');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });
  });

  // ─── Quality Tier Tests ───────────────────────────────────────────────────

  describe('Quality tier algorithms', () => {
    it('Simulated Annealing emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_sa_test';
      await kernel.run('simulated_annealing', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('simulated_annealing');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('A* emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_astar_test';
      await kernel.run('a_star', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('a_star');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('ACO (Ant Colony Optimization) emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_aco_test';
      await kernel.run('aco', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('aco');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('PSO (Particle Swarm Optimization) emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_pso_test';
      await kernel.run('pso', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('pso');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('Genetic Algorithm emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_genetic_test';
      await kernel.run('genetic_algorithm', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('genetic_algorithm');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('Optimized DFG emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_opt_dfg_test';
      await kernel.run('optimized_dfg', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('optimized_dfg');
      expect(span.attributes['algorithm.output_type']).toBe('dfg');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });

    it('ILP (Integer Linear Programming) emits OTEL span with correct attributes', async () => {
      const logHandle = 'log_ilp_test';
      await kernel.run('ilp', logHandle, { activity_key: 'concept:name' });

      expect(captures.length).toBe(1);
      const span = captures[0];

      expect(span.attributes['algorithm.name']).toBe('ilp');
      expect(span.attributes['algorithm.output_type']).toBe('petrinet');
      expect(span.attributes['algorithm.status']).toBe('ok');
      expect(span.status.code).toBe('OK');
    });
  });

  // ─── Cross-tier behavioral tests ──────────────────────────────────────────

  describe('Cross-tier algorithm behavior', () => {
    it('All algorithms emit non-blocking spans (span errors do not propagate)', async () => {
      let spanSinkThrow = false;
      kernel.setSpanSink((_span) => {
        if (!spanSinkThrow) return; // Pass through for first call
        throw new Error('Intentional span sink error');
      });

      spanSinkThrow = true;
      // Run should succeed despite span sink throwing — per TPS fail-fast rules
      // the span emission is never allowed to block the algorithm.
      const result = await kernel.run('dfg', 'log_nonblock_test', {
        activity_key: 'concept:name',
      });

      expect(result.handle).toBeDefined();
      expect(result.algorithm).toBe('dfg');
    });

    it('Multiple discovery runs emit multiple unique spans', async () => {
      const algos = [
        'dfg',
        'process_skeleton',
        'alpha_plus_plus',
        'heuristic_miner',
        'declare',
      ];

      for (const algo of algos) {
        await kernel.run(algo, `log_${algo}`, { activity_key: 'concept:name' });
      }

      expect(captures.length).toBe(5);
      for (let i = 0; i < algos.length; i++) {
        expect(captures[i].attributes['algorithm.name']).toBe(algos[i]);
        expect(captures[i].status.code).toBe('OK');
      }
    });

    it('Span trace and span IDs are unique per run', async () => {
      await kernel.run('dfg', 'log_1', { activity_key: 'concept:name' });
      await kernel.run('dfg', 'log_2', { activity_key: 'concept:name' });

      expect(captures.length).toBe(2);
      // Each span should have unique IDs (W3C trace context spec)
      expect(captures[0].trace_id).toBeDefined();
      expect(captures[1].trace_id).toBeDefined();
      expect(captures[0].span_id).toBeDefined();
      expect(captures[1].span_id).toBeDefined();

      // Trace IDs should be different (separate traces)
      expect(captures[0].trace_id).not.toBe(captures[1].trace_id);
      // Span IDs should be different
      expect(captures[0].span_id).not.toBe(captures[1].span_id);
    });

    it('Span duration is consistent with algorithm execution time', async () => {
      const start = Date.now();
      await kernel.run('genetic_algorithm', 'log_perf_test', {
        activity_key: 'concept:name',
      });
      const elapsed = Date.now() - start;

      expect(captures.length).toBe(1);
      const spanDuration = captures[0].attributes['algorithm.duration_ms'] as number;

      // Span duration should be close to actual elapsed time (within margin for V8/system noise)
      expect(spanDuration).toBeGreaterThan(0);
      expect(spanDuration).toBeLessThan(elapsed + 50);
    });

    it('Span status is ERROR when algorithm dispatch fails', async () => {
      const badStub = {
        async init() {},
        async discover_dfg() {
          throw new Error('WASM dispatch failed');
        },
      } as unknown as KernelWasmModule;

      const badKernel = new Kernel(badStub);
      await badKernel.init();
      badKernel.setSpanSink((span) => captures.push(span));

      try {
        await badKernel.run('dfg', 'log_fail_test', { activity_key: 'concept:name' });
      } catch {
        // Expected to throw
      }

      expect(captures.length).toBe(1);
      const span = captures[0];
      expect(span.status.code).toBe('ERROR');
      expect(span.status.message).toBe('WASM dispatch failed');
      expect(span.attributes['algorithm.status']).toBe('error');
    });
  });

  // ─── Registry consistency tests ────────────────────────────────────────────

  describe('Registry and span attribute consistency', () => {
    it('Span output type matches registry metadata for all discovery algorithms', async () => {
      const algos = [
        { id: 'dfg', expectedType: 'dfg' },
        { id: 'process_skeleton', expectedType: 'dfg' },
        { id: 'simd_streaming_dfg', expectedType: 'dfg' },
        { id: 'alpha_plus_plus', expectedType: 'petrinet' },
        { id: 'heuristic_miner', expectedType: 'dfg' },
        { id: 'inductive_miner', expectedType: 'tree' },
        { id: 'hill_climbing', expectedType: 'dfg' },
        { id: 'declare', expectedType: 'declare' },
        { id: 'simulated_annealing', expectedType: 'dfg' },
        { id: 'a_star', expectedType: 'dfg' },
        { id: 'aco', expectedType: 'dfg' },
        { id: 'pso', expectedType: 'dfg' },
        { id: 'genetic_algorithm', expectedType: 'dfg' },
        { id: 'optimized_dfg', expectedType: 'dfg' },
        { id: 'ilp', expectedType: 'petrinet' },
      ];

      for (const { id, expectedType } of algos) {
        captures = [];
        await kernel.run(id, `log_${id}`, { activity_key: 'concept:name' });

        expect(captures.length, `No span emitted for ${id}`).toBe(1);
        const span = captures[0];
        expect(span.attributes['algorithm.output_type'], `${id} output type mismatch`).toBe(
          expectedType
        );
      }
    });
  });
});
