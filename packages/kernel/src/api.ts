/**
 * api.ts
 * Kernel — versioned TypeScript facade over wasm4pm WASM algorithms
 *
 * Provides: Kernel.version(), Kernel.checkCompatibility(), Kernel.algorithms(),
 * Kernel.run(), Kernel.stream(), Kernel.freeHandle(), Kernel.stats()
 */

import type { WasmModule, AlgorithmStepOutput } from './handlers.js';
import type { AlgorithmMetadata, ExecutionProfile } from './registry.js';
import { getRegistry, type AlgorithmRegistry } from './registry.js';
import { KERNEL_VERSION, checkCompatibility, type CompatibilityResult } from './versioning.js';
import { hashOutput, hashAlgorithmResult } from './hashing.js';
import { KernelError, wrapKernelCall } from './errors.js';
import { validateKernelResult } from './validation.js';
import { computeTimeout, detectAlgorithmTier } from './adaptive-timeout.js';
export { ValidationError } from './validation.js';
export type { ViolationReport } from './validation.js';
export { computeTimeout, detectAlgorithmTier } from './adaptive-timeout.js';
export type { TimeoutFactors, TimeoutResult } from './adaptive-timeout.js';

// ─── OTEL-compatible span emission ───────────────────────────────────────────
//
// The kernel package does not depend on @wasm4pm/observability to keep the
// dependency graph acyclic (kernel is a foundation layer). Instead it emits
// JSON Lines spans to a pluggable sink function so that any consumer — CLI,
// engine, tests — can intercept, forward, or suppress the spans.
//
// Span schema follows the OpenTelemetry OTLP JSON Protobuf shape subset used
// throughout the wasm4pm observability package. Attributes match the semconv
// defined in packages/observability/src/instrumentation.ts for AlgorithmEvent.

export interface KernelSpan {
  trace_id: string;
  span_id: string;
  name: string;
  kind: 'INTERNAL';
  start_time: number; // nanoseconds (Date.now() * 1_000_000)
  end_time: number;   // nanoseconds
  status: { code: 'OK' | 'ERROR'; message?: string };
  attributes: {
    'service.name': string;
    'kernel.version': string;
    'algorithm.name': string;
    'algorithm.output_type': string;
    'algorithm.duration_ms': number;
    'algorithm.status': 'ok' | 'error';
    [key: string]: unknown;
  };
}

/** Sink function type — receives a completed span and may emit it anywhere. */
export type SpanSink = (span: KernelSpan) => void;

/** Default no-op sink — suppresses all spans unless overridden. */
const DEFAULT_SINK: SpanSink = () => {};

/** Hex generator for W3C trace/span IDs. Non-receipt IDs — not BLAKE3. */ // @lint-allow-random
function hexId(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256); // @lint-allow-fakery — crypto fallback
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).slice(0, length).join('');
}

/** Result returned from Kernel.run() */
export interface KernelResult {
  /** Opaque handle to the model in WASM memory */
  handle: string;

  /** Algorithm that produced this result */
  algorithm: string;

  /** Output type: dfg, petrinet, declare, tree */
  outputType: string;

  /** Execution time in milliseconds (computed via performance.now() for sub-ms accuracy) */
  durationMs: number;

  /** High-precision execution time in milliseconds (same as durationMs, kept for API clarity) */
  execution_ms: number;

  /** Parameters that were used */
  params: Record<string, unknown>;

  /** Deterministic hash of the output */
  hash: string;

  /** 
   * A token-efficient, highly condensed representation of this result,
   * optimized specifically for insertion into an LLM context window.
   */
  toLLMContext(): string;
}

/** Partial result emitted during streaming */
export interface PartialResult {
  /** Current progress (0-1) */
  progress: number;

  /** Intermediate handle (may change between emissions) */
  handle?: string;

  /** Status message */
  status: string;

  /** Whether this is the final emission */
  done: boolean;
}

/** Runtime statistics */
export interface KernelStats {
  /** WASM module initialized */
  initialized: boolean;

  /** Number of active handles */
  activeHandles: number;

  /** Number of algorithm runs since init */
  totalRuns: number;

  /** Cache hit count (parameter-based) */
  cacheHits: number;

  /** Kernel uptime in milliseconds */
  uptimeMs: number;
}

export interface KernelWasmModule extends Omit<WasmModule,
  | 'discover_dfg'
  | 'discover_ocel_dfg'
  | 'discover_ocel_dfg_per_type'
  | 'discover_alpha_plus_plus'
  | 'discover_heuristic_miner'
  | 'discover_inductive_miner'
  | 'discover_genetic_algorithm'
  | 'discover_pso_algorithm'
  | 'discover_astar'
  | 'discover_hill_climbing'
  | 'discover_ilp_petri_net'
  | 'discover_ant_colony'
  | 'discover_simulated_annealing'
  | 'discover_declare'
  | 'extract_process_skeleton'
  | 'discover_powl_from_log'
  | 'discover_powl_from_log_config'
  | 'discover_transition_system'
  | 'discover_prefix_tree'
  | 'discover_causal_graph'
  | 'discover_performance_spectrum'
  | 'discover_batches'
  | 'discover_correlation'
  | 'generalization'
  | 'reduce_petri_net'
  | 'wasm_compute_precision'
  | 'compute_optimal_alignments'
  | 'measure_complexity'
  | 'from_pnml'
  | 'read_bpmn'
  | 'powl_to_process_tree'
  | 'powl_to_yawl_string'
  | 'play_out'
  | 'monte_carlo_simulation'
  | 'discover_ml_classify'
  | 'discover_ml_cluster'
  | 'discover_ml_forecast'
  | 'discover_ml_pca'
  | 'discover_ml_anomaly'
  | 'discover_ml_regress'
  | 'discover_oc_petri_net'
  | 'discover_ocla_wasm'
  | 'discover_oc_declare_wasm'
  | 'encode_ocel_as_text'
  | 'flatten_ocel_to_eventlog'
  | 'discover_alpha_ppp_wasm'
  | 'discover_handover_network'
  | 'discover_working_together_network'
  | 'discover_dfg_simd'
> {
  /** Delete an object handle from WASM memory */
  delete_object?(handle: string): void;

  /** Clear all objects from WASM memory */
  clear_all_objects?(): void;

  store_dfg_from_json?(dfg_json: string): string;
  store_declare_from_json?(declare_json: string): string;
  discover_dfg_simd_handle?(eventlog_handle: string, activity_key: string): string;
  discover_dfg_hierarchical?(eventlog_handle: string, activity_key: string, num_chunks: number): string;
  discover_dfg_hierarchical_by_events?(eventlog_handle: string, activity_key: string, max_chunk_events: number): string;
  discover_transition_system_from_handle?(eventlog_handle: string, activity_key: string, window: number, direction: string): any;
  discover_causal_alpha?(eventlog_handle: string, activity_key: string): any;
  discover_causal_heuristic?(eventlog_handle: string, activity_key: string, threshold: number): any;
  discover_batches_wasm?(eventlog_handle: string, activity_key: string, timestamp_key: string): any;
  discover_performance_spectrum_wasm?(eventlog_handle: string, activity_key: string, timestamp_key: string, target_activity: string): any;
  discover_prefix_tree?(eventlog_handle: string, activity_key: string): any;
  discover_correlation?(eventlog_handle: string, activity_key: string, timestamp_key: string): any;
  discover_ml_classify?(eventlog_handle: string, activity_key: string): any;
  discover_ml_cluster?(eventlog_handle: string, activity_key: string): any;
  discover_ml_forecast?(eventlog_handle: string, activity_key: string): any;
  discover_ml_anomaly?(eventlog_handle: string, activity_key: string): any;
  discover_ml_regress?(eventlog_handle: string, activity_key: string): any;
  discover_ml_pca?(eventlog_handle: string, activity_key: string): any;
  discover_optimized_dfg?(eventlog_handle: string, activity_key: string): string;

  discover_dfg(eventlog_handle: string, activity_key: string): string;
  discover_ocel_dfg?(ocel_handle: string): string;
  discover_ocel_dfg_per_type?(ocel_handle: string): string;
  discover_alpha_plus_plus(eventlog_handle: string, activity_key: string, min_support: number): string;
  discover_heuristic_miner(eventlog_handle: string, activity_key: string, dependency_threshold: number): string;
  discover_inductive_miner(eventlog_handle: string, activity_key: string, noise_threshold: number): string;
  discover_genetic_algorithm(eventlog_handle: string, activity_key: string, population_size: number, generations: number): string;
  discover_pso_algorithm(eventlog_handle: string, activity_key: string, swarm_size: number, iterations: number): string;
  discover_astar(eventlog_handle: string, activity_key: string, max_iterations: number): string;
  discover_hill_climbing(eventlog_handle: string, activity_key: string, max_iterations: number): string;
  discover_ilp_petri_net(eventlog_handle: string, activity_key: string): string;
  discover_ant_colony(eventlog_handle: string, activity_key: string, colony_size: number, iterations: number): string;
  discover_simulated_annealing(eventlog_handle: string, activity_key: string, initial_temperature: number, cooling_rate: number): string;
  discover_declare(eventlog_handle: string, activity_key: string, support_threshold: number): string;
  extract_process_skeleton(eventlog_handle: string, activity_key: string, min_frequency: number): string;
  discover_powl_from_log(log_json: string, variant: string): { root: number; node_count: number; repr: string; variant: string };
  discover_powl_from_log_config(log_json: string, activity_key: string, variant: string, min_trace_count: number, noise_threshold: number): any;
  discover_transition_system(eventlog_handle: string, window: number, direction: string): string;
  discover_causal_graph(eventlog_handle: string, activity_key: string, method: string, dependency_threshold: number): string;
  discover_performance_spectrum(eventlog_handle: string, activity_key: string, timestamp_key: string): string;
  discover_batches(eventlog_handle: string, activity_key: string, timestamp_key: string, batch_threshold: number): string;
  generalization(eventlog_handle: string, petri_net_handle: string, activity_key: string): string;
  reduce_petri_net(petri_net_handle: string): string;
  wasm_compute_precision(eventlog_handle: string, petri_net_handle: string, activity_key: string): string;
  compute_optimal_alignments(eventlog_handle: string, petri_net_handle: string, activity_key: string, cost_config: string): string;
  measure_complexity(powl_handle: string): string;
  from_pnml(pnml_xml: string): string;
  read_bpmn(bpmn_xml: string): string;
  powl_to_process_tree(powl_handle: string): string;
  powl_to_yawl_string(powl_string: string): string;
  play_out(model_handle: string, num_traces: number, max_trace_length: number): string;
  monte_carlo_simulation(log_handle: string, powl_handle: string, root_id: string, config_json: string): string;
  discover_oc_petri_net?(ocel_handle: string, algorithm: string): string;
  discover_ocla_wasm?(ocel_handle: string): string;
  discover_oc_declare_wasm?(ocel_handle: string, noise_threshold: number): string;
  flatten_ocel_to_eventlog?(ocel_handle: string, object_type: string): string;
  discover_alpha_ppp_wasm?(log_handle: string, activity_key: string, absolute_thresh: number, causal_thresh: number): string;
  discover_handover_network?(log_handle: string, resource_key: string): string;
  discover_working_together_network?(log_handle: string, resource_key: string): string;
  discover_dfg_simd?(eventlog_handle: string, activity_key: string): string;
  encode_ocel_as_text?(ocel_handle: string): string;
}

/**
 * Kernel — the versioned API facade for wasm4pm
 *
 * Usage:
 * ```ts
 * const kernel = new Kernel(wasmModule);
 * await kernel.init();
 *
 * const result = await kernel.run('dfg', logHandle, { activity_key: 'concept:name' });
 * console.log(result.handle, result.hash);
 *
 * kernel.freeHandle(result.handle);
 * ```
 */
/**
 * Optional callback for capturing algorithm feedback (quality metrics).
 * Called after successful discovery runs (non-blocking).
 */
export type FeedbackCapture = (options: {
  algorithm: string;
  logSize: number;
  executionTimeMs: number;
  metrics: { fitness?: number; precision?: number | null; generalization?: number | null; simplicity?: number | null };
  metadata?: Record<string, unknown>;
}) => Promise<void>;

export interface DiscoveryParams {
  activity_key?: string;
  timestamp_key?: string;
  case_id_key?: string;
  noise_threshold?: number;
  [key: string]: unknown;
}

export class Kernel {
  private static _instance: Kernel | null = null;
  private wasm: KernelWasmModule;
  private registry: AlgorithmRegistry;
  private _initialized = false;
  private _handles = new Set<string>();
  private _totalRuns = 0;
  private _cacheHits = 0;
  private _startTime = Date.now();
  private _resultCache = new Map<string, KernelResult>();
  private _spanSink: SpanSink = DEFAULT_SINK;
  private _feedbackCapture: FeedbackCapture | undefined;
  private _smartEngineHandle: string | undefined;

  /**
   * Retrieves or initializes a global singleton instance of the Kernel.
   * Note: This requires the consumer to have initialized the WasmLoader elsewhere,
   * or it will attempt to initialize a default empty WASM module if none provided.
   */
  static async getInstance(wasmModule?: KernelWasmModule): Promise<Kernel> {
    if (!Kernel._instance) {
      if (!wasmModule) {
        throw new Error('Kernel.getInstance() requires a WasmModule on first initialization');
      }
      Kernel._instance = new Kernel(wasmModule);
      await Kernel._instance.init();
    }
    return Kernel._instance;
  }

  constructor(wasmModule: KernelWasmModule, options?: { spanSink?: SpanSink; feedbackCapture?: FeedbackCapture }) {
    this.wasm = wasmModule;
    this.registry = getRegistry();
    if (options?.spanSink) {
      this._spanSink = options.spanSink;
    }
    if (options?.feedbackCapture) {
      this._feedbackCapture = options.feedbackCapture;
    }
  }

  /**
   * Replace the span sink at runtime.
   *
   * Useful for tests that want to capture emitted spans without re-constructing
   * the kernel:
   * ```ts
   * const spans: KernelSpan[] = [];
   * kernel.setSpanSink(s => spans.push(s));
   * await kernel.run('dfg', handle);
   * expect(spans[0].attributes['algorithm.name']).toBe('dfg');
   * ```
   */
  setSpanSink(sink: SpanSink): void {
    this._spanSink = sink;
  }

  /**
   * Set the feedback capture callback.
   * Called after successful algorithm runs to capture quality metrics.
   * Non-blocking (failures are logged but don't affect result).
   */
  setFeedbackCapture(capture: FeedbackCapture): void {
    this._feedbackCapture = capture;
  }

  /**
   * Initialize the WASM module
   * Must be called before run() or stream()
   */
  async init(): Promise<void> {
    if (this._initialized) return;

    await wrapKernelCall(
      async () => {
        if (this.wasm.init) {
          await this.wasm.init();
        }
      },
      { step: 'init' }
    );

    this._initialized = true;
    this._startTime = Date.now();
  }

  /** Get the kernel version string */
  version(): string {
    return KERNEL_VERSION;
  }

  /**
   * Check if this kernel is compatible with a required version
   * @param requiredVersion - Semver string the caller requires
   */
  checkCompatibility(requiredVersion: string): CompatibilityResult {
    return checkCompatibility(requiredVersion);
  }

  /** List all registered algorithms with metadata */
  algorithms(): AlgorithmMetadata[] {
    return this.registry.list();
  }

  /** Get algorithms for a specific execution profile */
  algorithmsForProfile(profile: ExecutionProfile): AlgorithmMetadata[] {
    return this.registry.getForProfile(profile);
  }

  /** Look up a single algorithm's metadata */
  algorithm(id: string): AlgorithmMetadata | undefined {
    return this.registry.get(id);
  }

  /**
   * Run a discovery algorithm
   *
   * @param algorithmName - Algorithm ID (e.g. 'dfg', 'alpha_plus_plus', 'genetic_algorithm')
   * @param eventLogHandle - Handle to a loaded event log in WASM memory
   * @param params - Algorithm parameters (activity_key, thresholds, etc.)
   * @returns KernelResult with handle, hash, and metadata
   * @throws KernelError if algorithm not found, WASM call fails, or kernel not initialized
   */
  async run(
    algorithmName: string,
    eventLogHandle: string,
    params: Record<string, unknown> = {}
  ): Promise<KernelResult> {
    this.assertInitialized();

    if (!eventLogHandle || typeof eventLogHandle !== 'string' || eventLogHandle.trim() === '') {
      throw new KernelError('Invalid event log handle', 'MALFORMED_EVENT_LOG' as any);
    }
    const activityKey = (params.activity_key as string) ?? 'concept:name';
    if (!activityKey || typeof activityKey !== 'string' || activityKey.trim() === '') {
      throw new KernelError('Missing activity key field', 'MISSING_ACTIVITY_FIELD' as any);
    }

    const metadata = this.registry.get(algorithmName);
    if (!metadata) {
      throw new KernelError(
        `Algorithm not found: "${algorithmName}". Available: ${this.registry
          .list()
          .map((a) => a.id)
          .join(', ')}`,
        'ALGORITHM_NOT_FOUND' as any,
        { context: { algorithmName } }
      );
    }

    // Check cache
    const cacheKey = hashOutput({ algorithmName, eventLogHandle, params });
    const cached = this._resultCache.get(cacheKey);
    if (cached) {
      this._cacheHits++;
      try {
        const hitTime = Date.now() * 1_000_000;
        this._spanSink({
          trace_id: hexId(32),
          span_id: hexId(16),
          name: 'kernel.run',
          kind: 'INTERNAL',
          start_time: hitTime,
          end_time: hitTime,
          status: { code: 'OK' },
          attributes: {
            'service.name': 'wasm4pm',
            'kernel.version': KERNEL_VERSION,
            'algorithm.name': algorithmName,
            'algorithm.output_type': cached.outputType,
            'algorithm.duration_ms': cached.durationMs,
            'algorithm.status': 'ok',
            'algorithm.handle': cached.handle,
            'algorithm.hash': cached.hash,
            'cache.hit': true,
          },
        });
      } catch {
        // Never block on OTEL
      }
      return cached;
    }

    // `activityKey` is already validated and extracted above.

    // ── Compute adaptive timeout ───────────────────────────────────────────
    // Timeout is based on log size, complexity, and algorithm tier.
    // We estimate complexity as 'simple' here (no heuristics available at dispatch time);
    // the actual complexity could be refined with log statistics if available.
    const estimatedEventCount = (params.estimated_event_count as number) ?? 10_000;
    const algorithmTier = detectAlgorithmTier(algorithmName);
    const timeoutResult = computeTimeout({
      eventCount: estimatedEventCount,
      complexity: 'simple', // Conservative default; could be parameterized
      algorithmTier,
      algorithmName,
    });

    // ── OTEL span setup ────────────────────────────────────────────────────
    const traceId = hexId(32);
    const spanId = hexId(16);
    const spanStartNs = Date.now() * 1_000_000;
    const startTime = performance.now();

    let wasmResult: { handle: string };
    let spanStatus: 'OK' | 'ERROR' = 'OK';
    let spanErrorMessage: string | undefined;

    try {
      wasmResult = await wrapKernelCall(
        () => this.runRaw(algorithmName, eventLogHandle, activityKey, params),
        { algorithm: algorithmName }
      );
    } catch (err) {
      spanStatus = 'ERROR';
      spanErrorMessage = err instanceof Error ? err.message : String(err);
      const durationMsErr = performance.now() - startTime;
      // Emit error span non-blocking — never let OTEL block the hot path.
      try {
        this._spanSink({
          trace_id: traceId,
          span_id: spanId,
          name: 'kernel.run',
          kind: 'INTERNAL',
          start_time: spanStartNs,
          end_time: Date.now() * 1_000_000,
          status: { code: 'ERROR', message: spanErrorMessage },
          attributes: {
            'service.name': 'wasm4pm',
            'kernel.version': KERNEL_VERSION,
            'algorithm.name': algorithmName,
            'algorithm.output_type': metadata.outputType,
            'algorithm.duration_ms': durationMsErr,
            'algorithm.status': 'error',
          },
        });
      } catch {
        // Never block on OTEL — per TPS fail-fast rules the underlying error
        // is already re-thrown; the span emission failure is discarded.
      }
      throw err;
    }

    const durationMs = performance.now() - startTime;
    this._totalRuns++;
    this._handles.add(wasmResult.handle);

    const result: KernelResult = {
      handle: wasmResult.handle,
      algorithm: algorithmName,
      outputType: metadata.outputType,
      durationMs,
      execution_ms: durationMs,
      params: { activity_key: activityKey, ...params },
      hash: hashAlgorithmResult(
        algorithmName,
        { activity_key: activityKey, ...params },
        {
          handle: wasmResult.handle,
          outputType: metadata.outputType,
        }
      ),
      toLLMContext: () => {
         const paramStr = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ');
         return `<process_model algo="${algorithmName}" type="${metadata.outputType}" duration_ms="${durationMs.toFixed(1)}" hash="${result.hash}">\n  <params>${paramStr}</params>\n  <handle>${wasmResult.handle}</handle>\n</process_model>`;
      }
    };

    // Validate structural integrity before caching
    validateKernelResult(result, metadata);

    // ── Emit completion span (non-blocking) ────────────────────────────────
    try {
      this._spanSink({
        trace_id: traceId,
        span_id: spanId,
        name: 'kernel.run',
        kind: 'INTERNAL',
        start_time: spanStartNs,
        end_time: Math.max(Date.now() * 1_000_000, spanStartNs + 1_000_000),
        status: { code: spanStatus, message: spanErrorMessage },
        attributes: {
          'service.name': 'wasm4pm',
          'kernel.version': KERNEL_VERSION,
          'algorithm.name': algorithmName,
          'algorithm.output_type': metadata.outputType,
          'algorithm.duration_ms': durationMs,
          'algorithm.status': 'ok',
          'algorithm.handle': result.handle,
          'algorithm.hash': result.hash,
          'timeout.computed_ms': timeoutResult.timeoutMs,
          'timeout.algorithm_tier': algorithmTier,
        },
      });
    } catch {
      // Never block on OTEL.
    }

    // ── Capture feedback (non-blocking) ────────────────────────────────
    if (this._feedbackCapture) {
      this._feedbackCapture({
        algorithm: algorithmName,
        logSize: this.getLogSizeHint(eventLogHandle),
        executionTimeMs: durationMs,
        metrics: {},
      }).catch(() => {
        // Silently ignore feedback capture failures per TPS rules
      });
    }

    this._resultCache.set(cacheKey, result);
    return result;
  }

  /**
   * Discover a process model.
   * Semantic facade over `run()` for discovery algorithms.
   * 
   * @example
   * ```ts
   * const result = await kernel.discover('inductive_miner', logHandle, { noise_threshold: 0.2 });
   * console.log(result.handle);
   * ```
   */
  async discover(
    algorithmName: string,
    eventLogHandle: string,
    params: DiscoveryParams = {}
  ): Promise<KernelResult> {
    return this.run(algorithmName, eventLogHandle, params);
  }

  /**
   * Predict an outcome or metric.
   * Semantic facade over `run()` for prediction algorithms.
   * 
   * @example
   * ```ts
   * const result = await kernel.predict('next_activity', logHandle, { prefix: "A,B,C" });
   * console.log(result.handle);
   * ```
   */
  async predict(
    algorithmName: string,
    eventLogHandle: string,
    params: DiscoveryParams = {}
  ): Promise<KernelResult> {
    return this.run(algorithmName, eventLogHandle, params);
  }

  /**
   * Stream algorithm results (for algorithms that support incremental output)
   * Falls back to single-shot run with progress simulation for non-streaming algorithms
   */
  async *stream(
    algorithmName: string,
    eventLogHandle: string,
    params: Record<string, unknown> = {}
  ): AsyncGenerator<PartialResult> {
    this.assertInitialized();

    // Emit starting event
    yield { progress: 0, status: `Starting ${algorithmName}...`, done: false };

    // Run the algorithm
    yield { progress: 0.5, status: `Running ${algorithmName}...`, done: false };

    const result = await this.run(algorithmName, eventLogHandle, params);

    // Emit completion
    yield {
      progress: 1,
      handle: result.handle,
      status: `Completed ${algorithmName} in ${result.durationMs}ms`,
      done: true,
    };
  }

  /**
   * Free a handle from WASM memory
   * Safe to call multiple times on the same handle
   */
  freeHandle(handle: string): void {
    if (!this._handles.has(handle)) return;

    if (!handle.startsWith('virtual_')) {
      try {
        if (this.wasm.delete_object) {
          this.wasm.delete_object(handle);
        }
      } catch {
        // Best-effort: handle may already be freed
      }
    }

    this._handles.delete(handle);
    // Invalidate any cached results referencing this handle
    for (const [key, cached] of this._resultCache) {
      if (cached.handle === handle) {
        this._resultCache.delete(key);
      }
    }
  }

  /** Get runtime statistics */
  stats(): KernelStats {
    return {
      initialized: this._initialized,
      activeHandles: this._handles.size,
      totalRuns: this._totalRuns,
      cacheHits: this._cacheHits,
      uptimeMs: Date.now() - this._startTime,
    };
  }

  /** Reset the kernel state (clears caches and handles, does not re-init WASM) */
  reset(): void {
    this._resultCache.clear();
    this._handles.clear();
    this._totalRuns = 0;
    this._cacheHits = 0;
  }

  // ── Private ──────────────────────────────────────────────────────────

  private assertInitialized(): void {
    if (!this._initialized) {
      throw new KernelError(
        'Kernel not initialized. Call kernel.init() first.',
        'KERNEL_NOT_INITIALIZED'
      );
    }
  }

  /**
   * Estimate log size from handle (for feedback purposes).
   * This is a heuristic; exact size calculation would require WASM introspection.
   * Returns a reasonable estimate based on handle if available.
   */
  private getLogSizeHint(_handle: string): number {
    // Heuristic: if WASM exposes a stats function, call it
    // For now, return 0 (unknown) — callers should enrich with actual size
    return 0;
  }

  /**
   * Dispatch to the correct WASM function based on algorithm ID, returning raw JSON/object.
   */
  public async runRaw(
    algorithmId: string,
    eventLogHandle: string,
    activityKey: string,
    params: Record<string, unknown>
  ): Promise<any> {
    switch (algorithmId) {
      case 'dfg': {
        const dfgJson = this.wasm.discover_dfg(eventLogHandle, activityKey);
        if ((dfgJson as any) instanceof Promise || (dfgJson && typeof (dfgJson as any).then === 'function')) {
          return (dfgJson as any).then((resolvedDfgJson: string) => {
            const handle = this.wasm.store_dfg_from_json
              ? this.wasm.store_dfg_from_json(resolvedDfgJson)
              : resolvedDfgJson;
            return parseWasmHandle(handle);
          });
        }
        const handle = this.wasm.store_dfg_from_json
          ? this.wasm.store_dfg_from_json(dfgJson)
          : dfgJson;
        return parseWasmHandle(handle);
      }

      case 'hierarchical_dfg': {
        const dfgJson = this.wasm.discover_dfg_hierarchical!(
          eventLogHandle,
          activityKey,
          (params.num_chunks as number) ?? 4
        );
        if ((dfgJson as any) instanceof Promise || (dfgJson && typeof (dfgJson as any).then === 'function')) {
          return (dfgJson as any).then((resolvedDfgJson: string) => {
            const handle = this.wasm.store_dfg_from_json
              ? this.wasm.store_dfg_from_json(resolvedDfgJson)
              : resolvedDfgJson;
            return parseWasmHandle(handle);
          });
        }
        const handle = this.wasm.store_dfg_from_json
          ? this.wasm.store_dfg_from_json(dfgJson)
          : dfgJson;
        return parseWasmHandle(handle);
      }

      case 'streaming_log': {
        const dfgJson = this.wasm.discover_dfg(eventLogHandle, activityKey);
        if ((dfgJson as any) instanceof Promise || (dfgJson && typeof (dfgJson as any).then === 'function')) {
          return (dfgJson as any).then((resolvedDfgJson: string) => {
            const handle = this.wasm.store_dfg_from_json
              ? this.wasm.store_dfg_from_json(resolvedDfgJson)
              : resolvedDfgJson;
            return parseWasmHandle(handle);
          });
        }
        const handle = this.wasm.store_dfg_from_json
          ? this.wasm.store_dfg_from_json(dfgJson)
          : dfgJson;
        return parseWasmHandle(handle);
      }

      case 'smart_engine': {
        const engineHandle = await this.getSmartEngine();
        const traces = this.wasm.get_traces ? this.wasm.get_traces(eventLogHandle, activityKey) : [];
        const resultJson = this.wasm.smart_engine_run
          ? this.wasm.smart_engine_run(engineHandle, (params.algorithm as string) ?? 'dfg', JSON.stringify(traces))
          : await this.wasm.discover_dfg(eventLogHandle, activityKey);

        if (typeof resultJson === 'string' && resultJson.startsWith('{')) {
          return { handle: resultJson };
        }
        return typeof resultJson === 'string' ? { handle: resultJson } : resultJson;
      }

      case 'simd_streaming_dfg': {
        const fn = this.wasm.discover_dfg_simd_handle || this.wasm.discover_dfg_simd;
        if (!fn) throw new KernelError('discover_dfg_simd_handle is not available', 'ALGORITHM_NOT_FOUND' as any);
        const handle = fn.call(this.wasm, eventLogHandle, activityKey);
        return parseWasmHandle(handle);
      }

      case 'process_skeleton': {
        const raw = this.wasm.extract_process_skeleton(
          eventLogHandle,
          activityKey,
          (params.min_frequency as number) ?? 2
        );
        return parseWasmHandle(raw);
      }

      case 'alpha_plus_plus': {
        const raw = this.wasm.discover_alpha_plus_plus(
          eventLogHandle,
          activityKey,
          (params.min_support as number) ?? 0.0
        );
        return parseWasmHandle(raw);
      }

      case 'heuristic_miner': {
        const raw = this.wasm.discover_heuristic_miner(
          eventLogHandle,
          activityKey,
          (params.dependency_threshold as number) ?? 0.5
        );
        return parseWasmHandle(raw);
      }

      case 'inductive_miner': {
        const json = this.wasm.discover_inductive_miner(
          eventLogHandle,
          activityKey,
          (params.noise_threshold as number) ?? 0.2
        );
        const virtualHandle = `virtual_inductive_miner_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
        return {
          handle: virtualHandle,
          metadata: { result: parseWasmOutput(json) }
        } as any;
      }

      case 'genetic_algorithm': {
        const raw = this.wasm.discover_genetic_algorithm(
          eventLogHandle,
          activityKey,
          (params.population_size as number) ?? 50,
          (params.generations as number) ?? 100
        );
        return parseWasmHandle(raw);
      }

      case 'pso': {
        const raw = this.wasm.discover_pso_algorithm(
          eventLogHandle,
          activityKey,
          (params.swarm_size as number) ?? 30,
          (params.iterations as number) ?? 50
        );
        return parseWasmHandle(raw);
      }

      case 'a_star': {
        const raw = this.wasm.discover_astar(
          eventLogHandle,
          activityKey,
          (params.max_iterations as number) ?? 10000
        );
        return parseWasmHandle(raw);
      }

      case 'hill_climbing': {
        const raw = this.wasm.discover_hill_climbing(
          eventLogHandle,
          activityKey,
          (params.max_iterations as number) ?? 100
        );
        return parseWasmHandle(raw);
      }

      case 'ilp': {
        const raw = this.wasm.discover_ilp_petri_net(eventLogHandle, activityKey);
        return parseWasmHandle(raw);
      }

      case 'aco': {
        const raw = this.wasm.discover_ant_colony(
          eventLogHandle,
          activityKey,
          (params.colony_size as number) ?? 40,
          (params.iterations as number) ?? 100
        );
        return parseWasmHandle(raw);
      }

      case 'simulated_annealing': {
        const raw = this.wasm.discover_simulated_annealing(
          eventLogHandle,
          activityKey,
          (params.initial_temperature as number) ?? 100,
          (params.cooling_rate as number) ?? 0.95
        );
        return parseWasmHandle(raw);
      }

      case 'declare': {
        const decJson = this.wasm.discover_declare(
          eventLogHandle,
          activityKey,
          (params.support_threshold as number) ?? 0.8
        );
        if ((decJson as any) instanceof Promise || (decJson && typeof (decJson as any).then === 'function')) {
          return (decJson as any).then((resolvedDecJson: string) => {
            const handle = this.wasm.store_declare_from_json
              ? this.wasm.store_declare_from_json(resolvedDecJson)
              : resolvedDecJson;
            return parseWasmHandle(handle);
          });
        }
        const handle = this.wasm.store_declare_from_json
          ? this.wasm.store_declare_from_json(decJson)
          : decJson;
        return parseWasmHandle(handle);
      }

      case 'optimized_dfg': {
        const fn = this.wasm.discover_optimized_dfg || this.wasm.discover_dfg;
        const raw = fn.call(this.wasm, eventLogHandle, activityKey);
        return parseWasmHandle(raw);
      }

      // ─── Wave 1 Migration: Discovery algorithms ───────────────────────

      case 'transition_system': {
        const res = this.wasm.discover_transition_system_from_handle!(
          eventLogHandle,
          activityKey,
          (params.window as number) ?? 1,
          (params.direction as string) ?? 'forward'
        );
        const virtualHandle = `virtual_transition_system_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
        return {
          handle: virtualHandle,
          metadata: { result: parseWasmOutput(res) }
        } as any;
      }

      case 'log_to_trie': {
        const res = this.wasm.discover_prefix_tree!(eventLogHandle, activityKey);
        const virtualHandle = `virtual_log_to_trie_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
        return {
          handle: virtualHandle,
          metadata: { result: parseWasmOutput(res) }
        } as any;
      }

      case 'causal_graph': {
        const res = ((params.method as string) ?? 'heuristic') === 'heuristic'
          ? this.wasm.discover_causal_heuristic!(
              eventLogHandle,
              activityKey,
              (params.dependency_threshold as number) ?? 0.5
            )
          : this.wasm.discover_causal_alpha!(eventLogHandle, activityKey);
        const virtualHandle = `virtual_causal_graph_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
        return {
          handle: virtualHandle,
          metadata: { result: parseWasmOutput(res) }
        } as any;
      }

      case 'performance_spectrum': {
        const res = this.wasm.discover_performance_spectrum_wasm!(
          eventLogHandle,
          activityKey,
          (params.timestamp_key as string) ?? 'time:timestamp',
          (params.target_activity as string) ?? ''
        );
        const virtualHandle = `virtual_performance_spectrum_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
        return {
          handle: virtualHandle,
          metadata: { result: parseWasmOutput(res) }
        } as any;
      }

      case 'batches': {
        const res = this.wasm.discover_batches_wasm!(
          eventLogHandle,
          activityKey,
          (params.timestamp_key as string) ?? 'time:timestamp'
        );
        const virtualHandle = `virtual_batches_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
        return {
          handle: virtualHandle,
          metadata: { result: parseWasmOutput(res) }
        } as any;
      }

      case 'correlation_miner': {
        const res = this.wasm.discover_correlation!(
          eventLogHandle,
          activityKey,
          (params.timestamp_key as string) ?? 'time:timestamp'
        );
        const virtualHandle = `virtual_correlation_miner_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
        return {
          handle: virtualHandle,
          metadata: { result: parseWasmOutput(res) }
        } as any;
      }

      // ─── Wave 1 Migration: Conformance algorithms ──────────────────────

      case 'generalization': {
        const raw = this.wasm.generalization(
          eventLogHandle,
          (params.petri_net_handle as string)!,
          activityKey
        );
        return parseWasmHandle(raw);
      }

      case 'petri_net_reduction': {
        const raw = this.wasm.reduce_petri_net((params.petri_net_handle as string)!);
        return parseWasmHandle(raw);
      }

      case 'etconformance_precision':
      case 'precision': {
        const raw = this.wasm.wasm_compute_precision(
          eventLogHandle,
          (params.petri_net_handle as string)!,
          activityKey
        );
        return parseWasmHandle(raw);
      }

      case 'compute_simplicity': {
        this.wasm.wasm_compute_simplicity(
          (params.places as number) ?? 0,
          (params.transitions as number) ?? 0,
          (params.arcs as number) ?? 0
        );
        return { handle: `simplicity_${Date.now()}` };
      }

      case 'alignments': {
        const costConfig = JSON.stringify({
          sync_cost: (params.sync_cost as number) ?? 0,
          log_move_cost: (params.log_move_cost as number) ?? 1,
          model_move_cost: (params.model_move_cost as number) ?? 1,
        });
        const raw = this.wasm.compute_optimal_alignments(
          eventLogHandle,
          (params.petri_net_handle as string)!,
          activityKey,
          costConfig
        );
        return parseWasmHandle(raw);
      }

      // ─── Wave 1 Migration: Quality metrics ───────────────────────────────

      case 'complexity_metrics': {
        const raw = this.wasm.measure_complexity((params.powl_handle as string)!);
        return parseWasmHandle(raw);
      }

      // ─── Wave 1 Migration: Model conversion ────────────────────────────

      case 'pnml_import': {
        const raw = this.wasm.from_pnml((params.pnml_xml as string)!);
        return parseWasmHandle(raw);
      }

      case 'bpmn_import': {
        const raw = this.wasm.read_bpmn((params.bpmn_xml as string)!);
        return parseWasmHandle(raw);
      }

      case 'powl_to_process_tree': {
        const raw = this.wasm.powl_to_process_tree((params.powl_handle as string)!);
        return parseWasmHandle(raw);
      }

      case 'yawl_export': {
        const xml = await this.wasm.powl_to_yawl_string((params.powl_string as string)!);
        return { handle: `yawl_${Date.now()}`, ...parseWasmOutput<any>(xml) };
      }

      // ─── Wave 1 Migration: Simulation ──────────────────────────────────

      case 'playout': {
        const raw = this.wasm.play_out(
          (params.model_handle as string)!,
          (params.num_traces as number) ?? 100,
          (params.max_trace_length as number) ?? 100
        );
        return parseWasmHandle(raw);
      }

      case 'monte_carlo_simulation': {
        const mcConfig = {
          num_cases: (params.num_simulations as number) ?? 1000,
          inter_arrival_mean_ms: 1000.0,
          activity_service_time_ms: {},
          resource_capacity: {},
          simulation_time_ms: 60000,
          random_seed: 42,
        };
        const raw = this.wasm.monte_carlo_simulation(
          (params.model_handle as string)!,
          '',
          '',
          JSON.stringify(mcConfig)
        );
        return parseWasmHandle(raw);
      }

      case 'handover_network': {
        const raw = this.wasm.discover_handover_network!(
          eventLogHandle,
          (params.resource_key as string) ?? 'org:resource'
        );
        return parseWasmHandle(raw);
      }

      case 'working_together_network': {
        const raw = this.wasm.discover_working_together_network!(
          eventLogHandle,
          (params.resource_key as string) ?? 'org:resource'
        );
        return parseWasmHandle(raw);
      }

      // ─── OCEL (Object-Centric Event Log) algorithms ──────────────────────

      case 'ocel_dfg': {
        if (!this.wasm.discover_ocel_dfg) {
          throw new KernelError('discover_ocel_dfg is not available (requires feature-ocel)', 'ALGORITHM_NOT_FOUND' as any);
        }
        const raw = this.wasm.discover_ocel_dfg(eventLogHandle);
        return parseWasmHandle(raw);
      }

      case 'ocel_dfg_per_type': {
        if (!this.wasm.discover_ocel_dfg_per_type) {
          throw new KernelError('discover_ocel_dfg_per_type is not available (requires feature-ocel)', 'ALGORITHM_NOT_FOUND' as any);
        }
        const raw = this.wasm.discover_ocel_dfg_per_type(eventLogHandle);
        return parseWasmHandle(raw);
      }

      case 'ocel_petri_net': {
        const fn = this.wasm.discover_oc_petri_net;
        if (!fn) throw new KernelError('discover_oc_petri_net is not available (requires feature-ocel)', 'ALGORITHM_NOT_FOUND' as any);
        const algorithm = (params.algorithm as string) ?? 'inductive';
        fn.call(this.wasm, eventLogHandle, algorithm);
        return { handle: `ocel_petri_net_${Date.now()}` };
      }

      case 'ocel_ocla': {
        const fn = this.wasm.discover_ocla_wasm;
        if (!fn) throw new KernelError('discover_ocla_wasm is not available (requires feature-ocel)', 'ALGORITHM_NOT_FOUND' as any);
        fn.call(this.wasm, eventLogHandle);
        return { handle: `ocel_ocla_${Date.now()}` };
      }

      case 'ocel_oc_declare': {
        const fn = this.wasm.discover_oc_declare_wasm;
        if (!fn) throw new KernelError('discover_oc_declare_wasm is not available (requires feature-ocel)', 'ALGORITHM_NOT_FOUND' as any);
        const thresh = (params.noise_threshold as number) ?? 0.1;
        await fn.call(this.wasm, eventLogHandle, thresh);
        return { handle: `ocel_oc_declare_${Date.now()}` };
      }

      case 'ocel_encode': {
        const fn = this.wasm.encode_ocel_as_text;
        if (!fn) throw new KernelError('encode_ocel_as_text is not available (requires feature-ocel)', 'ALGORITHM_NOT_FOUND' as any);
        await fn.call(this.wasm, eventLogHandle);
        return { handle: `ocel_encode_${Date.now()}` };
      }

      // ─── Analytics (Wave 2) ──────────────────────────────────────────────

      case 'detect_drift': {
        const json = this.wasm.detect_drift!(
          eventLogHandle,
          activityKey,
          (params.window_size as number) ?? 50
        );
        return { handle: `drift_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      case 'compute_ewma': {
        const json = this.wasm.compute_ewma!(
          (params.values_json as string)!,
          (params.alpha as number) ?? 0.3
        );
        return { handle: `ewma_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      case 'analyze_variant_complexity': {
        const json = this.wasm.analyze_variant_complexity!(eventLogHandle, activityKey);
        return { handle: `complexity_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      case 'compute_activity_transition_matrix': {
        const json = this.wasm.compute_activity_transition_matrix!(eventLogHandle, activityKey);
        return { handle: `transition_matrix_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      case 'analyze_process_speedup': {
        const json = this.wasm.analyze_process_speedup!(
          eventLogHandle,
          (params.timestamp_key as string) ?? 'time:timestamp',
          (params.window_size as number) ?? 10
        );
        return { handle: `speedup_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      case 'compute_trace_similarity_matrix': {
        const json = this.wasm.compute_trace_similarity_matrix!(eventLogHandle, activityKey);
        return { handle: `similarity_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      case 'automl_classify': {
        const json = await this.wasm.discover_automl_classify!(eventLogHandle, activityKey);
        return { handle: `automl_classify_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      case 'automl_forecast': {
        const json = await this.wasm.discover_automl_forecast!(eventLogHandle, activityKey);
        return { handle: `automl_forecast_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      case 'automl_regress': {
        const json = await this.wasm.discover_ml_regress_automl!(eventLogHandle, activityKey);
        return { handle: `automl_regress_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      case 'agentic_pipeline': {
        const json = await this.wasm.run_agentic_pipeline!((params.task_json as string) ?? '{}');
        return { handle: `agentic_pipeline_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }

      // ─── ML algorithms (Restored WASM paths) ─────────────────────────────

      case 'ml_classify': {
        if (this.wasm.discover_ml_classify) {
          const res = await this.wasm.discover_ml_classify(eventLogHandle, activityKey);
          const virtualHandle = `virtual_ml_classify_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
          return {
            handle: virtualHandle,
            metadata: { result: parseWasmOutput(res) }
          } as any;
        }
        throw new KernelError(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`, 'ALGORITHM_NOT_FOUND' as any);
      }

      case 'ml_cluster': {
        if (this.wasm.discover_ml_cluster) {
          const res = await this.wasm.discover_ml_cluster(eventLogHandle, activityKey);
          const virtualHandle = `virtual_ml_cluster_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
          return {
            handle: virtualHandle,
            metadata: { result: parseWasmOutput(res) }
          } as any;
        }
        throw new KernelError(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`, 'ALGORITHM_NOT_FOUND' as any);
      }

      case 'ml_forecast': {
        if (this.wasm.discover_ml_forecast) {
          const res = await this.wasm.discover_ml_forecast(eventLogHandle, activityKey);
          const virtualHandle = `virtual_ml_forecast_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
          return {
            handle: virtualHandle,
            metadata: { result: parseWasmOutput(res) }
          } as any;
        }
        throw new KernelError(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`, 'ALGORITHM_NOT_FOUND' as any);
      }

      case 'ml_anomaly': {
        if (this.wasm.discover_ml_anomaly) {
          const res = await this.wasm.discover_ml_anomaly(eventLogHandle, activityKey);
          const virtualHandle = `virtual_ml_anomaly_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
          return {
            handle: virtualHandle,
            metadata: { result: parseWasmOutput(res) }
          } as any;
        }
        throw new KernelError(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`, 'ALGORITHM_NOT_FOUND' as any);
      }

      case 'ml_regress': {
        if (this.wasm.discover_ml_regress) {
          const res = await this.wasm.discover_ml_regress(eventLogHandle, activityKey);
          const virtualHandle = `virtual_ml_regress_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
          return {
            handle: virtualHandle,
            metadata: { result: parseWasmOutput(res) }
          } as any;
        }
        throw new KernelError(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`, 'ALGORITHM_NOT_FOUND' as any);
      }

      case 'ml_pca': {
        if (this.wasm.discover_ml_pca) {
          const res = await this.wasm.discover_ml_pca(eventLogHandle, activityKey);
          const virtualHandle = `virtual_ml_pca_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
          return {
            handle: virtualHandle,
            metadata: { result: parseWasmOutput(res) }
          } as any;
        }
        throw new KernelError(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`, 'ALGORITHM_NOT_FOUND' as any);
      }

      // ─── Prediction (Stubs preserved for high-level package requirement) ─

      case 'predict_next_activity':
      case 'predict_remaining_time':
      case 'predict_outcome':
        throw new Error(
          `Prediction algorithm '${algorithmId}' requires the @wasm4pm/predict package. ` +
          `Use the CLI command: wpm predict ...`
        );

      default:
        throw new KernelError(`Unsupported algorithm: ${algorithmId}`, 'ALGORITHM_NOT_FOUND' as any);
    }
  }

  /**
   * Get or create the global SmartEngine handle for this kernel instance.
   */
  private async getSmartEngine(): Promise<string> {
    if (!this._smartEngineHandle && this.wasm.smart_engine_create) {
      try {
        this._smartEngineHandle = this.wasm.smart_engine_create();
      } catch (e) {
        console.warn('Failed to create SmartEngine, falling back to default', e);
        return 'default';
      }
    }
    return this._smartEngineHandle ?? 'default';
  }
}

/**
 * Parse a WASM function return value that may be a JSON string or already an object.
 *
 * Many wasm4pm WASM exports return `string` on wasm32 targets (serialized JSON)
 * but may return a plain object when called via test stubs or future refactors.
 * This helper normalizes both cases, eliminating the repeated
 * `typeof r === 'string' ? JSON.parse(r) : r` pattern across the codebase.
 *
 * @example
 * const dfg = parseWasmOutput<{ nodes: string[] }>(wasm.discover_dfg(handle, key));
 */
export function parseWasmOutput<T = unknown>(raw: unknown): T {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return raw as unknown as T;
      }
    }
    return raw as unknown as T;
  }
  return raw as T;
}

/**
 * Handle WASM outputs that are expected to represent a handle.
 * If the output is a plain string handle, it wraps it in an object: `{ handle }`.
 * If it is a Promise, it resolves recursively.
 */
export function parseWasmHandle(raw: unknown): any {
  if (raw instanceof Promise || (raw && typeof (raw as any).then === 'function')) {
    return (raw as any).then((resolved: unknown) => parseWasmHandle(resolved));
  }
  const parsed = parseWasmOutput<any>(raw);
  if (typeof parsed === 'string') {
    return { handle: parsed };
  }
  if (parsed && typeof parsed === 'object' && 'handle' in parsed) {
    return parsed as { handle: string };
  }
  return { handle: String(parsed) };
}
