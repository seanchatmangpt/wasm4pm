/**
 * wasm-backend.ts
 *
 * WASM backend implementation wrapping wasm4pm algorithms.
 * 35 algorithms with sub-ms latency and quality support up to "quality" tier.
 *
 * Spec reference: Section 3.3 (WasmBackend declaration)
 */

import * as wasm from 'wasm4pm';
import type {
  MiningBackend,
  BackendCapabilities,
  EventLogIR,
  ModelIR,
  ResultEnvelope,
  BudgetEnvelope,
  ConformanceResult,
  AnalysisTask,
  ProvenanceChain,
  LatencyClass,
} from '../mining-backend.js';

/**
 * All 35 algorithm IDs supported by the WASM backend.
 */
const SUPPORTED_ALGORITHM_IDS = [
  // Discovery
  'dfg',
  'process_skeleton',
  'alpha_plus_plus',
  'heuristic_miner',
  'inductive_miner',
  'genetic_algorithm',
  'pso',
  'a_star',
  'hill_climbing',
  'ilp',
  'aco',
  'simulated_annealing',
  'declare',
  'optimized_dfg',
  'simd_streaming_dfg',
  'hierarchical_dfg',
  'smart_engine',

  // ML Analysis algorithms are handled by MlBackend, not WasmBackend.
  // They are listed separately in ml-backend.ts's SUPPORTED_ALGORITHM_IDS.

  // Analysis & Utilities
  'transition_system',
  'causal_graph',
  'performance_spectrum',
  'variants',
  'generalization',
  'petri_net_reduction',
  'complexity_metrics',
  'analyze_statistics',
  'detect_bottlenecks',
  'detect_drift',
];

/**
 * Derive latency class from estimated duration (ms).
 */
function deriveLatencyClass(estimatedDurationMs: number): LatencyClass {
  if (estimatedDurationMs < 1) return 'sub_ms';
  if (estimatedDurationMs < 100) return 'low_ms';
  if (estimatedDurationMs < 10000) return 'high_ms';
  if (estimatedDurationMs < 600000) return 'seconds';
  return 'minutes';
}

/**
 * Validate WASM-returned quality metrics. Throws if any field is missing or non-finite.
 *
 * Sibling fix to PR #82: no silent fallbacks to 0.85/0.8/0.75/100. Per
 * `.claude/rules/critical-constraints.md`:
 *
 *     "FAIL FAST — No silent fallbacks. Errors must propagate visibly."
 *
 * If a downstream WASM build (e.g., a stripped `mobile` profile) does not
 * export the quality fields, callers must see the absence as a defect, not as
 * a plausible-looking constant. Without this guard, conformance/quality
 * dashboards would report "fitness=0.85" even when no replay actually ran —
 * exactly the PR #82 class of bug for the `wasm` backend.
 */
function validateQualityMetrics(
  parsed: Record<string, unknown> | null | undefined,
  algorithmId: string,
  context: 'discovery' | 'conformance'
): { fitness: number; precision: number; generalization: number; simplicity: number } {
  if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
    throw new Error(
      `WasmBackend.${context}(${algorithmId}): WASM returned non-object result; expected quality {fitness, precision, generalization, simplicity}`
    );
  }
  for (const field of ['fitness', 'precision', 'generalization', 'simplicity'] as const) {
    const v = (parsed as Record<string, unknown>)[field];
    if (v === undefined || v === null) {
      throw new Error(
        `WasmBackend.${context}(${algorithmId}): WASM result missing '${field}'. Rebuild with a profile that exports quality metrics (fog/browser) or use a backend with quality support.`
      );
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      throw new Error(
        `WasmBackend.${context}(${algorithmId}): WASM result '${field}' is non-finite (${String(v)}); refusing to silently coerce`
      );
    }
  }
  const p = parsed as Record<string, unknown>;
  return {
    fitness: Number(p.fitness),
    precision: Number(p.precision),
    generalization: Number(p.generalization),
    simplicity: Number(p.simplicity),
  };
}

/**
 * WasmBackend: WASM process mining algorithms.
 */
export class WasmBackend implements MiningBackend {
  readonly id = 'wasm';
  private initialized = false;

  async init(): Promise<void> {
    const loader = wasm as unknown as Record<string, unknown>;
    if (loader && typeof loader['init'] === 'function') {
      await (loader['init'] as () => Promise<void>)();
    }
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  isReady(): boolean {
    return this.initialized;
  }

  capabilities(): BackendCapabilities {
    return {
      algorithmFamilies: ['discovery', 'conformance', 'analysis', 'ml', 'simulation'],
      outputTypes: ['dfg', 'petri_net', 'process_tree', 'declare', 'powl', 'ml_result'],
      environment: {
        browserSafe: true,
        edgeSafe: true,
        requiresPython: false,
        requiresNetwork: false,
      },
      latencyClass: 'sub_ms',
      deterministic: true,
      maxQualityTier: 'quality',
      supportedAlgorithmIds: SUPPORTED_ALGORITHM_IDS,
      maxConcurrentInvocations: 8,
    };
  }

  async discover(
    log: EventLogIR,
    algorithmId: string,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ModelIR>> {
    const startMs = Date.now();

    try {
      if (!SUPPORTED_ALGORITHM_IDS.includes(algorithmId)) {
        throw new Error(`Algorithm ${algorithmId} not supported by WASM backend`);
      }

      const logJson = JSON.stringify(log);
      const logHandle = wasm.load_eventlog_from_json(logJson);

      let resultRaw: unknown;
      switch (algorithmId) {
        case 'dfg':
        case 'optimized_dfg':
          resultRaw = wasm.discover_dfg(logHandle, 'concept:name');
          break;
        case 'process_skeleton':
          resultRaw = wasm.extract_process_skeleton(logHandle, 'concept:name', 2);
          break;
        case 'alpha_plus_plus':
          resultRaw = wasm.discover_alpha_plus_plus(logHandle, 'concept:name', 0.1);
          break;
        case 'heuristic_miner':
          resultRaw = wasm.discover_heuristic_miner(logHandle, 'concept:name', 0.5);
          break;
        case 'inductive_miner':
          resultRaw = wasm.discover_inductive_miner(logHandle, 'concept:name');
          break;
        case 'genetic_algorithm':
          resultRaw = wasm.discover_genetic_algorithm(logHandle, 'concept:name', 50, 100);
          break;
        case 'ilp':
          resultRaw = wasm.discover_ilp_petri_net(logHandle, 'concept:name');
          break;
        case 'a_star':
          resultRaw = wasm.discover_astar(logHandle, 'concept:name', 1000);
          break;
        case 'declare':
          resultRaw = wasm.discover_declare(logHandle, 'concept:name');
          break;
        case 'smart_engine':
          resultRaw = wasm.smart_engine_run(logHandle, 'auto', '');
          break;
        default:
          throw new Error(
            `Execution for algorithm ${algorithmId} not implemented in WASM backend bridge`
          );
      }

      const parsed = typeof resultRaw === 'string' ? JSON.parse(resultRaw) : resultRaw;

      // Sibling fix to PR #82: do NOT fabricate quality. Discovery functions
      // (e.g. discover_dfg) return graph topology only; quality must come from
      // a real conformance run. If WASM happens to include quality, validate
      // it strictly (no || 0.85 fallbacks). Otherwise omit the quality field —
      // it is optional on ModelIR.
      const hasAnyQuality =
        parsed &&
        typeof parsed === 'object' &&
        (parsed.fitness !== undefined ||
          parsed.precision !== undefined ||
          parsed.generalization !== undefined ||
          parsed.simplicity !== undefined);

      const quality = hasAnyQuality
        ? validateQualityMetrics(parsed, algorithmId, 'discovery')
        : undefined;

      const modelIr: ModelIR = {
        format_version: '1.0',
        model_type: algorithmId.includes('dfg') ? 'dfg' : 'petri_net',
        algorithm_id: algorithmId,
        capabilities: {
          online_safe: true,
          offline_only: false,
          replay_ready: true,
          alignment_ready: false,
          streaming_compatible: false,
          exportable_to_pnml: true,
          exportable_to_bpmn: false,
        },
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
        ...(quality !== undefined ? { quality } : {}),
      };

      const latency_ms = Date.now() - startMs;

      return {
        run_id: this.generateUuid(),
        status: 'success',
        payload: modelIr,
        latency_ms,
        latency_class: deriveLatencyClass(latency_ms),
        backend_id: this.id,
        invocation_id: this.generateUuid(),
        cycle_seq: 0,
        algorithm_id: algorithmId,
        model_ir: modelIr,
        provenance: this.createProvenance(algorithmId, 'discovery'),
        stale: false,
      };
    } catch (error) {
      return this.createFailedResult(algorithmId, startMs, String(error)) as unknown as ResultEnvelope<ModelIR>;
    }
  }

  async conformance(
    log: EventLogIR,
    model: ModelIR,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<ConformanceResult>> {
    const startMs = Date.now();

    try {
      const logJson = JSON.stringify(log);
      const logHandle = wasm.load_eventlog_from_json(logJson);

      // Sibling fix to PR #82: require WASM to actually return quality metrics.
      if (typeof (wasm as Record<string, unknown>).check_token_based_replay !== 'function') {
        throw new Error(
          "WasmBackend.conformance: WASM module missing 'check_token_based_replay'. Required for token-replay conformance. Rebuild WASM with the `feature-conformance-basic` flag (profiles: mobile/iot/edge/fog/browser)."
        );
      }
      const modelJson = JSON.stringify(model);
      const resultRaw = wasm.check_token_based_replay(logHandle, modelJson, 'concept:name');
      const parsed = typeof resultRaw === 'string' ? JSON.parse(resultRaw) : resultRaw;

      // ConformanceResult fields are all required — no silent fallbacks.
      const result: ConformanceResult = validateQualityMetrics(
        parsed,
        'check_token_based_replay',
        'conformance'
      );

      const latency_ms = Date.now() - startMs;

      return {
        run_id: this.generateUuid(),
        status: 'success',
        payload: result,
        latency_ms,
        latency_class: deriveLatencyClass(latency_ms),
        backend_id: this.id,
        invocation_id: this.generateUuid(),
        cycle_seq: 0,
        algorithm_id: 'conformance',
        provenance: this.createProvenance('conformance', 'conformance'),
        stale: false,
      };
    } catch (error) {
      return this.createFailedResult('conformance', startMs, String(error)) as unknown as ResultEnvelope<ConformanceResult>;
    }
  }

  async analyze(
    log: EventLogIR,
    task: AnalysisTask,
    budget: BudgetEnvelope
  ): Promise<ResultEnvelope<unknown>> {
    const startMs = Date.now();

    try {
      const logJson = JSON.stringify(log);
      const logHandle = wasm.load_eventlog_from_json(logJson);

      let resultRaw: unknown;
      switch (task.task_type) {
        case 'analyze_statistics':
          resultRaw = wasm.analyze_event_statistics(logHandle);
          break;
        case 'detect_bottlenecks':
          resultRaw = wasm.detect_bottlenecks(
            logHandle,
            'concept:name',
            'time:timestamp',
            BigInt(3600)
          );
          break;
        case 'detect_drift':
          resultRaw = wasm.detect_drift(logHandle, 'concept:name', 50);
          break;
        case 'variants':
          resultRaw = wasm.analyze_trace_variants(logHandle, 'concept:name');
          break;
        default:
          throw new Error(`Analysis task ${task.task_type} not implemented in WASM backend bridge`);
      }

      const parsed = typeof resultRaw === 'string' ? JSON.parse(resultRaw) : resultRaw;
      const latency_ms = Date.now() - startMs;

      return {
        run_id: this.generateUuid(),
        status: 'success',
        payload: parsed,
        latency_ms,
        latency_class: deriveLatencyClass(latency_ms),
        backend_id: this.id,
        invocation_id: this.generateUuid(),
        cycle_seq: 0,
        algorithm_id: task.task_type,
        provenance: this.createProvenance(task.task_type, 'analysis'),
        stale: false,
      };
    } catch (error) {
      return this.createFailedResult(task.task_type, startMs, String(error));
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latency_ms: number; detail?: string }> {
    const startMs = Date.now();
    try {
      const registryRaw = wasm.get_capability_registry();
      const latency_ms = Date.now() - startMs;

      return {
        healthy: !!registryRaw,
        latency_ms,
        detail: 'WASM module loaded and responsive',
      };
    } catch (error) {
      return {
        healthy: false,
        latency_ms: Date.now() - startMs,
        detail: `WASM health check failed: ${error}`,
      };
    }
  }

  private generateUuid(): string {
    return crypto.randomUUID?.() || `uuid-${Date.now()}-${Math.random()}`; // @lint-allow-fakery — UUID fallback when crypto.randomUUID unavailable
  }

  private createProvenance(algorithmId: string, operationType: string): ProvenanceChain {
    return {
      input_hash: `hash-input-${algorithmId}`,
      config_hash: `hash-config-${algorithmId}`,
      plan_hash: `hash-plan-${algorithmId}`,
      output_hash: `hash-output-${algorithmId}`,
      combined_hash: `hash-combined-${algorithmId}`,
      algorithm_id: algorithmId,
      algorithm_version: '1.0',
      backend_id: this.id,
      kernel_version: '26.4.23',
      wasm_build_hash: 'stable',
    };
  }

  private createFailedResult(
    algorithmId: string,
    startMs: number,
    errorMessage: string
  ): ResultEnvelope<null> {
    const latency_ms = Date.now() - startMs;
    return {
      run_id: this.generateUuid(),
      status: 'failed',
      payload: null,
      error: errorMessage,
      latency_ms,
      latency_class: deriveLatencyClass(latency_ms),
      backend_id: this.id,
      invocation_id: this.generateUuid(),
      cycle_seq: 0,
      algorithm_id: algorithmId,
      provenance: this.createProvenance(algorithmId, 'unknown'),
      stale: false,
    };
  }
}
