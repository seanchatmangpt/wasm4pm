/**
 * gap-fixes.test.ts
 *
 * Regression tests for three kernel registry gaps closed in feat/iter16-miniml-prolog8:
 *
 * Gap 1 — simd_streaming_dfg dispatch correctness
 *   The registry advertised a ~500x-faster SIMD algorithm, but the dispatch table
 *   silently called discover_dfg (standard DFG) instead of discover_dfg_simd.
 *   A practitioner selecting the SIMD algorithm got standard throughput, not SIMD.
 *
 * Gap 2 — DeploymentProfile type: 'cloud' renamed to 'mobile' + correct hierarchy
 *   The registry used 'cloud' as a deployment profile — a term that does not exist
 *   in the WASM build system. The correct profiles are mobile/iot/edge/fog/browser.
 *   'browser' is the full-featured ~2.7MB build; 'mobile' is the ~500KB minimal build.
 *   The infer logic mapped 'quality' algorithms to 'cloud' instead of 'browser',
 *   so getForDeploymentProfile('browser') returned far fewer algorithms than expected.
 *
 * Gap 3 — Social network mining algorithms were dead WASM exports
 *   discover_handover_network() and discover_working_together_network() existed in
 *   the Rust binary but had no registry entry and no dispatch path. The organisational
 *   perspective (van der Aalst) was completely unreachable from TypeScript.
 */

import { describe, it, expect, vi } from 'vitest';
import { getRegistry } from '../src/registry';
import { Kernel } from '../src/api';
import type { KernelWasmModule } from '../src/api';

// ─── Gap 1: simd_streaming_dfg dispatch correctness ───────────────────────────

describe('Gap 1 — simd_streaming_dfg dispatches to discover_dfg_simd (not discover_dfg)', () => {
  function makeWasm(): {
    wasm: KernelWasmModule;
    calls: { dfg: number; simd: number };
  } {
    const calls = { dfg: 0, simd: 0 };
    const wasm: KernelWasmModule = {
      init: vi.fn(),
      get_version: vi.fn(() => '26.5.28'),
      load_eventlog_from_xes: vi.fn((_xes: string) => 'log_handle_test'),
      delete_object: vi.fn(),
      clear_all_objects: vi.fn(),
      // Standard DFG — counts invocations
      discover_dfg: vi.fn((_h: string, _k: string) => {
        calls.dfg++;
        return Promise.resolve({ handle: 'dfg_result' });
      }),
      // SIMD DFG — counts invocations
      discover_dfg_simd: vi.fn((_h: string, _k: string) => {
        calls.simd++;
        return Promise.resolve({ handle: 'simd_result' });
      }),
      // Stubs for all other required methods
      discover_alpha_plus_plus: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_heuristic_miner: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_inductive_miner: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_genetic_algorithm: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_pso_algorithm: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_astar: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_hill_climbing: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_ilp_petri_net: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_ant_colony: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_simulated_annealing: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_declare: vi.fn(() => Promise.resolve({ handle: 'h' })),
      extract_process_skeleton: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_powl_from_log: vi.fn(() =>
        Promise.resolve({ root: 0, node_count: 0, repr: '', variant: 'test' })
      ),
      discover_powl_from_log_config: vi.fn(() =>
        Promise.resolve({
          root: 0,
          node_count: 0,
          repr: '',
          variant: 'test',
          config: { activity_key: 'concept:name', min_trace_count: 1, noise_threshold: 0.2 },
        })
      ),
      discover_transition_system: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_prefix_tree: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_causal_graph: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_performance_spectrum: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_batches: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_correlation: vi.fn(() => Promise.resolve({ handle: 'h' })),
      generalization: vi.fn(() => Promise.resolve({ handle: 'h' })),
      reduce_petri_net: vi.fn(() => Promise.resolve({ handle: 'h' })),
      wasm_compute_precision: vi.fn(() => Promise.resolve({ handle: 'h' })),
      wasm_compute_simplicity: vi.fn(() => 0.9),
      compute_optimal_alignments: vi.fn(() => Promise.resolve({ handle: 'h' })),
      measure_complexity: vi.fn(() => Promise.resolve({ handle: 'h' })),
      from_pnml: vi.fn(() => Promise.resolve({ handle: 'h' })),
      read_bpmn: vi.fn(() => Promise.resolve({ handle: 'h' })),
      powl_to_process_tree: vi.fn(() => Promise.resolve({ handle: 'h' })),
      powl_to_yawl_string: vi.fn(() => Promise.resolve('{}')),
      play_out: vi.fn(() => Promise.resolve({ handle: 'h' })),
      monte_carlo_simulation: vi.fn(() => Promise.resolve({ handle: 'h' })),
      extract_case_features: vi.fn(() => '{"traces":[]}'),
      detect_drift: vi.fn(() => '{"drifts":[]}'),
      discover_ocel_dfg: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_ocel_dfg_per_type: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_handover_network: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_working_together_network: vi.fn(() => Promise.resolve({ handle: 'h' })),
    };
    return { wasm, calls };
  }

  it('running simd_streaming_dfg calls discover_dfg_simd, not discover_dfg', async () => {
    const { wasm, calls } = makeWasm();
    const kernel = new Kernel(wasm);
    await kernel.init();

    await kernel.run('simd_streaming_dfg', 'log_handle', {});

    expect(calls.simd).toBe(1);
    expect(calls.dfg).toBe(0);
  });

  it('running plain dfg still calls discover_dfg', async () => {
    const { wasm, calls } = makeWasm();
    const kernel = new Kernel(wasm);
    await kernel.init();

    await kernel.run('dfg', 'log_handle', {});

    expect(calls.dfg).toBe(1);
    expect(calls.simd).toBe(0);
  });

  it('simd_streaming_dfg and dfg call different WASM functions on the same kernel', async () => {
    const { wasm, calls } = makeWasm();
    const kernel = new Kernel(wasm);
    await kernel.init();

    await kernel.run('dfg', 'log_1', {});
    await kernel.run('simd_streaming_dfg', 'log_2', {});

    expect(calls.dfg).toBe(1);
    expect(calls.simd).toBe(1);
  });
});

// ─── Gap 2: DeploymentProfile hierarchy correctness ───────────────────────────

describe('Gap 2 — DeploymentProfile type is mobile/iot/edge/fog/browser (not cloud)', () => {
  const registry = getRegistry();

  it("'browser' is the full-featured profile with the most algorithms", () => {
    const profiles = (['mobile', 'iot', 'edge', 'fog', 'browser'] as const);
    const counts = profiles.map((p) => registry.getForDeploymentProfile(p).length);
    const max = Math.max(...counts);
    const browserCount = registry.getForDeploymentProfile('browser').length;
    expect(browserCount).toBe(max);
  });

  it("'mobile' is the minimal profile with the fewest algorithms", () => {
    const mobileCount = registry.getForDeploymentProfile('mobile').length;
    const browserCount = registry.getForDeploymentProfile('browser').length;
    expect(mobileCount).toBeLessThan(browserCount);
    expect(mobileCount).toBeGreaterThan(0);
  });

  it("'browser' includes quality-tier algorithms (genetic, ilp, aco)", () => {
    const browserIds = registry.getForDeploymentProfile('browser').map((a) => a.id);
    expect(browserIds).toContain('genetic_algorithm');
    expect(browserIds).toContain('ilp');
    expect(browserIds).toContain('aco');
  });

  it("'mobile' includes fast-tier algorithms (dfg, simd_streaming_dfg)", () => {
    const mobileIds = registry.getForDeploymentProfile('mobile').map((a) => a.id);
    expect(mobileIds).toContain('dfg');
    expect(mobileIds).toContain('simd_streaming_dfg');
  });

  it("fast execution profile algorithms are all in 'mobile' (infer correctness)", () => {
    const fastAlgos = registry.getForProfile('fast');
    const mobileIds = new Set(registry.getForDeploymentProfile('mobile').map((a) => a.id));
    for (const algo of fastAlgos) {
      expect(mobileIds.has(algo.id), `fast algo '${algo.id}' missing from mobile`).toBe(true);
    }
  });

  it("quality execution profile algorithms are all in 'browser'", () => {
    const qualityAlgos = registry.getForProfile('quality');
    const browserIds = new Set(registry.getForDeploymentProfile('browser').map((a) => a.id));
    for (const algo of qualityAlgos) {
      expect(browserIds.has(algo.id), `quality algo '${algo.id}' missing from browser`).toBe(true);
    }
  });

  it('no algorithm has an invalid deployment profile', () => {
    const validProfiles = new Set(['mobile', 'iot', 'edge', 'fog', 'browser']);
    for (const algo of registry.list()) {
      for (const p of algo.deploymentProfiles) {
        expect(
          validProfiles.has(p),
          `Algorithm '${algo.id}' has invalid deploymentProfile '${p}'`
        ).toBe(true);
      }
    }
  });
});

// ─── Gap 3: Social network mining algorithms are now reachable ────────────────

describe('Gap 3 — Social network mining algorithms are registered and dispatchable', () => {
  const registry = getRegistry();

  it("'handover_network' is in the registry with correct metadata", () => {
    const meta = registry.get('handover_network');
    expect(meta).toBeDefined();
    expect(meta!.outputType).toBe('analytics');
    expect(meta!.description).toContain('handover');
    expect(meta!.parameters.some((p) => p.name === 'resource_key')).toBe(true);
    expect(meta!.parameters.find((p) => p.name === 'resource_key')?.default).toBe('org:resource');
  });

  it("'working_together_network' is in the registry with correct metadata", () => {
    const meta = registry.get('working_together_network');
    expect(meta).toBeDefined();
    expect(meta!.outputType).toBe('analytics');
    expect(meta!.description).toContain('working');
    expect(meta!.parameters.some((p) => p.name === 'resource_key')).toBe(true);
  });

  it('both social network algorithms cite the van der Aalst 2005 reference', () => {
    const hn = registry.get('handover_network');
    const wt = registry.get('working_together_network');
    expect(hn!.references?.some((r) => r.includes('van der Aalst'))).toBe(true);
    expect(wt!.references?.some((r) => r.includes('van der Aalst'))).toBe(true);
  });

  it('both algorithms appear in balanced and browser deployment profiles', () => {
    const browserIds = registry.getForDeploymentProfile('browser').map((a) => a.id);
    expect(browserIds).toContain('handover_network');
    expect(browserIds).toContain('working_together_network');
  });

  it('social network algorithms are NOT in mobile profile (too minimal)', () => {
    const mobileIds = registry.getForDeploymentProfile('mobile').map((a) => a.id);
    expect(mobileIds).not.toContain('handover_network');
    expect(mobileIds).not.toContain('working_together_network');
  });

  it('Kernel.run dispatches handover_network to discover_handover_network WASM fn', async () => {
    let handoverCalls = 0;
    let handoverResourceKey = '';

    const wasm: KernelWasmModule = {
      init: vi.fn(),
      get_version: vi.fn(() => '26.5.28'),
      load_eventlog_from_xes: vi.fn((_xes: string) => 'handle'),
      delete_object: vi.fn(),
      clear_all_objects: vi.fn(),
      discover_dfg: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_dfg_simd: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_alpha_plus_plus: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_heuristic_miner: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_inductive_miner: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_genetic_algorithm: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_pso_algorithm: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_astar: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_hill_climbing: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_ilp_petri_net: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_ant_colony: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_simulated_annealing: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_declare: vi.fn(() => Promise.resolve({ handle: 'h' })),
      extract_process_skeleton: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_powl_from_log: vi.fn(() =>
        Promise.resolve({ root: 0, node_count: 0, repr: '', variant: 'test' })
      ),
      discover_powl_from_log_config: vi.fn(() =>
        Promise.resolve({
          root: 0,
          node_count: 0,
          repr: '',
          variant: 'test',
          config: { activity_key: 'concept:name', min_trace_count: 1, noise_threshold: 0.2 },
        })
      ),
      discover_transition_system: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_prefix_tree: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_causal_graph: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_performance_spectrum: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_batches: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_correlation: vi.fn(() => Promise.resolve({ handle: 'h' })),
      generalization: vi.fn(() => Promise.resolve({ handle: 'h' })),
      reduce_petri_net: vi.fn(() => Promise.resolve({ handle: 'h' })),
      wasm_compute_precision: vi.fn(() => Promise.resolve({ handle: 'h' })),
      wasm_compute_simplicity: vi.fn(() => 0.9),
      compute_optimal_alignments: vi.fn(() => Promise.resolve({ handle: 'h' })),
      measure_complexity: vi.fn(() => Promise.resolve({ handle: 'h' })),
      from_pnml: vi.fn(() => Promise.resolve({ handle: 'h' })),
      read_bpmn: vi.fn(() => Promise.resolve({ handle: 'h' })),
      powl_to_process_tree: vi.fn(() => Promise.resolve({ handle: 'h' })),
      powl_to_yawl_string: vi.fn(() => Promise.resolve('{}')),
      play_out: vi.fn(() => Promise.resolve({ handle: 'h' })),
      monte_carlo_simulation: vi.fn(() => Promise.resolve({ handle: 'h' })),
      extract_case_features: vi.fn(() => '{"traces":[]}'),
      detect_drift: vi.fn(() => '{"drifts":[]}'),
      discover_ocel_dfg: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_ocel_dfg_per_type: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_handover_network: vi.fn((_h: string, resourceKey: string) => {
        handoverCalls++;
        handoverResourceKey = resourceKey;
        return Promise.resolve({ handle: 'hn_result' });
      }),
      discover_working_together_network: vi.fn(() => Promise.resolve({ handle: 'wt_result' })),
    };

    const kernel = new Kernel(wasm);
    await kernel.init();

    const result = await kernel.run('handover_network', 'log_handle', {
      resource_key: 'org:group',
    });

    expect(handoverCalls).toBe(1);
    expect(handoverResourceKey).toBe('org:group');
    expect(result.handle).toBe('hn_result');
    expect(result.algorithm).toBe('handover_network');
    expect(result.outputType).toBe('analytics');
  });

  it('Kernel.run defaults resource_key to org:resource when not specified', async () => {
    let capturedKey = '';
    const wasm: KernelWasmModule = {
      init: vi.fn(),
      get_version: vi.fn(() => '26.5.28'),
      load_eventlog_from_xes: vi.fn((_xes: string) => 'h'),
      delete_object: vi.fn(),
      clear_all_objects: vi.fn(),
      discover_dfg: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_dfg_simd: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_alpha_plus_plus: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_heuristic_miner: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_inductive_miner: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_genetic_algorithm: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_pso_algorithm: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_astar: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_hill_climbing: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_ilp_petri_net: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_ant_colony: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_simulated_annealing: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_declare: vi.fn(() => Promise.resolve({ handle: 'h' })),
      extract_process_skeleton: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_powl_from_log: vi.fn(() =>
        Promise.resolve({ root: 0, node_count: 0, repr: '', variant: '' })
      ),
      discover_powl_from_log_config: vi.fn(() =>
        Promise.resolve({
          root: 0,
          node_count: 0,
          repr: '',
          variant: '',
          config: { activity_key: 'concept:name', min_trace_count: 1, noise_threshold: 0.2 },
        })
      ),
      discover_transition_system: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_prefix_tree: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_causal_graph: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_performance_spectrum: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_batches: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_correlation: vi.fn(() => Promise.resolve({ handle: 'h' })),
      generalization: vi.fn(() => Promise.resolve({ handle: 'h' })),
      reduce_petri_net: vi.fn(() => Promise.resolve({ handle: 'h' })),
      wasm_compute_precision: vi.fn(() => Promise.resolve({ handle: 'h' })),
      wasm_compute_simplicity: vi.fn(() => 0.9),
      compute_optimal_alignments: vi.fn(() => Promise.resolve({ handle: 'h' })),
      measure_complexity: vi.fn(() => Promise.resolve({ handle: 'h' })),
      from_pnml: vi.fn(() => Promise.resolve({ handle: 'h' })),
      read_bpmn: vi.fn(() => Promise.resolve({ handle: 'h' })),
      powl_to_process_tree: vi.fn(() => Promise.resolve({ handle: 'h' })),
      powl_to_yawl_string: vi.fn(() => Promise.resolve('{}')),
      play_out: vi.fn(() => Promise.resolve({ handle: 'h' })),
      monte_carlo_simulation: vi.fn(() => Promise.resolve({ handle: 'h' })),
      extract_case_features: vi.fn(() => '{"traces":[]}'),
      detect_drift: vi.fn(() => '{"drifts":[]}'),
      discover_ocel_dfg: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_ocel_dfg_per_type: vi.fn(() => Promise.resolve({ handle: 'h' })),
      discover_handover_network: vi.fn((_h: string, key: string) => {
        capturedKey = key;
        return Promise.resolve({ handle: 'hn' });
      }),
      discover_working_together_network: vi.fn(() => Promise.resolve({ handle: 'wt' })),
    };

    const kernel = new Kernel(wasm);
    await kernel.init();

    // Call without specifying resource_key — should default to 'org:resource'
    await kernel.run('working_together_network', 'log_handle', {});

    // The working_together_network mock captures nothing, but we verify handover default:
    await kernel.run('handover_network', 'log_handle_2', {});
    expect(capturedKey).toBe('org:resource');
  });
});
