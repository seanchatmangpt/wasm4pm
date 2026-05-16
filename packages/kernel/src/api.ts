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
import { KernelError, wrapKernelCall, classifyRustError } from './errors.js';
import { validateKernelResult, ValidationError } from './validation.js';
export { ValidationError } from './validation.js';
export type { ViolationReport } from './validation.js';

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

/**
 * Extended WASM module interface — adds lifecycle methods on top of WasmModule
 */
export interface KernelWasmModule extends WasmModule {
  /** Initialize the WASM module */
  init?(): Promise<void>;

  /** Get wasm4pm version */
  get_version?(): string;

  /** Load an event log from an XES string and return an opaque handle */
  load_eventlog_from_xes?(xes: string): string;

  /** Delete an object handle from WASM memory */
  delete_object?(handle: string): void;

  /** Clear all objects from WASM memory */
  clear_all_objects?(): void;
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
export class Kernel {
  private wasm: KernelWasmModule;
  private registry: AlgorithmRegistry;
  private _initialized = false;
  private _handles = new Set<string>();
  private _totalRuns = 0;
  private _cacheHits = 0;
  private _startTime = Date.now();
  private _resultCache = new Map<string, KernelResult>();
  private _spanSink: SpanSink = DEFAULT_SINK;

  constructor(wasmModule: KernelWasmModule, options?: { spanSink?: SpanSink }) {
    this.wasm = wasmModule;
    this.registry = getRegistry();
    if (options?.spanSink) {
      this._spanSink = options.spanSink;
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

    const metadata = this.registry.get(algorithmName);
    if (!metadata) {
      throw new KernelError(
        `Algorithm not found: "${algorithmName}". Available: ${this.registry
          .list()
          .map((a) => a.id)
          .join(', ')}`,
        'ALGORITHM_NOT_FOUND',
        { context: { algorithmName } }
      );
    }

    // Check cache
    const cacheKey = hashOutput({ algorithmName, eventLogHandle, params });
    const cached = this._resultCache.get(cacheKey);
    if (cached) {
      this._cacheHits++;
      return cached;
    }

    const activityKey = (params.activity_key as string) ?? 'concept:name';

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
        () => this.dispatchAlgorithm(algorithmName, eventLogHandle, activityKey, params),
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
        end_time: Date.now() * 1_000_000,
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
        },
      });
    } catch {
      // Never block on OTEL.
    }

    this._resultCache.set(cacheKey, result);
    return result;
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

    try {
      if (this.wasm.delete_object) {
        this.wasm.delete_object(handle);
      }
    } catch {
      // Best-effort: handle may already be freed
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
   * Dispatch to the correct WASM function based on algorithm ID
   */
  private async dispatchAlgorithm(
    algorithmId: string,
    eventLogHandle: string,
    activityKey: string,
    params: Record<string, unknown>
  ): Promise<{ handle: string }> {
    switch (algorithmId) {
      case 'dfg':
      case 'simd_streaming_dfg':
      case 'hierarchical_dfg':
      case 'streaming_log':
      case 'smart_engine':
        return this.wasm.discover_dfg(eventLogHandle, activityKey);

      case 'process_skeleton':
        return this.wasm.extract_process_skeleton(
          eventLogHandle,
          activityKey,
          (params.min_frequency as number) ?? 2
        );

      case 'alpha_plus_plus':
        return this.wasm.discover_alpha_plus_plus(
          eventLogHandle,
          activityKey,
          (params.min_support as number) ?? 0.0
        );

      case 'heuristic_miner':
        return this.wasm.discover_heuristic_miner(
          eventLogHandle,
          activityKey,
          (params.dependency_threshold as number) ?? 0.5
        );

      case 'inductive_miner':
        return this.wasm.discover_inductive_miner(
          eventLogHandle,
          activityKey,
          (params.noise_threshold as number) ?? 0.2
        );

      case 'genetic_algorithm':
        return this.wasm.discover_genetic_algorithm(
          eventLogHandle,
          activityKey,
          (params.population_size as number) ?? 50,
          (params.generations as number) ?? 100
        );

      case 'pso':
        return this.wasm.discover_pso_algorithm(
          eventLogHandle,
          activityKey,
          (params.swarm_size as number) ?? 30,
          (params.iterations as number) ?? 50
        );

      case 'a_star':
        return this.wasm.discover_astar(
          eventLogHandle,
          activityKey,
          (params.max_iterations as number) ?? 10000
        );

      case 'hill_climbing':
        return this.wasm.discover_hill_climbing(
          eventLogHandle,
          activityKey,
          (params.max_iterations as number) ?? 100
        );

      case 'ilp':
        return this.wasm.discover_ilp_petri_net(eventLogHandle, activityKey);

      case 'aco':
        return this.wasm.discover_ant_colony(
          eventLogHandle,
          activityKey,
          (params.colony_size as number) ?? 40,
          (params.iterations as number) ?? 100
        );

      case 'simulated_annealing':
        return this.wasm.discover_simulated_annealing(
          eventLogHandle,
          activityKey,
          (params.initial_temperature as number) ?? 100,
          (params.cooling_rate as number) ?? 0.95
        );

      case 'declare':
        return this.wasm.discover_declare(
          eventLogHandle,
          activityKey,
          (params.support_threshold as number) ?? 0.8
        );

      case 'optimized_dfg':
        return this.wasm.discover_dfg(eventLogHandle, activityKey);

      // ─── Wave 1 Migration: Discovery algorithms ───────────────────────

      case 'transition_system':
        return this.wasm.discover_transition_system(
          eventLogHandle,
          (params.window as number) ?? 1,
          (params.direction as string) ?? 'forward'
        );

      case 'log_to_trie':
        return this.wasm.discover_prefix_tree(eventLogHandle, activityKey);

      case 'causal_graph':
        return this.wasm.discover_causal_graph(
          eventLogHandle,
          activityKey,
          (params.method as string) ?? 'heuristic',
          (params.dependency_threshold as number) ?? 0.5
        );

      case 'performance_spectrum':
        return this.wasm.discover_performance_spectrum(
          eventLogHandle,
          activityKey,
          (params.timestamp_key as string) ?? 'time:timestamp'
        );

      case 'batches':
        return this.wasm.discover_batches(
          eventLogHandle,
          activityKey,
          (params.timestamp_key as string) ?? 'time:timestamp',
          (params.batch_threshold as number) ?? 86400000
        );

      case 'correlation_miner':
        return this.wasm.discover_correlation(
          eventLogHandle,
          activityKey,
          (params.timestamp_key as string) ?? 'time:timestamp'
        );

      // ─── Wave 1 Migration: Conformance algorithms ──────────────────────

      case 'generalization':
        return this.wasm.generalization(
          eventLogHandle,
          (params.petri_net_handle as string)!,
          activityKey
        );

      case 'petri_net_reduction':
        return this.wasm.reduce_petri_net((params.petri_net_handle as string)!);

      case 'etconformance_precision':
      case 'precision':
        return this.wasm.wasm_compute_precision(
          eventLogHandle,
          (params.petri_net_handle as string)!,
          activityKey
        );

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
        return this.wasm.compute_optimal_alignments(
          eventLogHandle,
          (params.petri_net_handle as string)!,
          activityKey,
          costConfig
        );
      }

      // ─── Wave 1 Migration: Quality metrics ───────────────────────────────

      case 'complexity_metrics':
        return this.wasm.measure_complexity((params.powl_handle as string)!);

      // ─── Wave 1 Migration: Model conversion ────────────────────────────

      case 'pnml_import':
        return this.wasm.from_pnml((params.pnml_xml as string)!);

      case 'bpmn_import':
        return this.wasm.read_bpmn((params.bpmn_xml as string)!);

      case 'powl_to_process_tree':
        return this.wasm.powl_to_process_tree((params.powl_handle as string)!);

      case 'yawl_export': {
        const xml = await this.wasm.powl_to_yawl_string((params.powl_string as string)!);
        return { handle: `yawl_${Date.now()}`, ...JSON.parse(xml) };
      }

      // ─── Wave 1 Migration: Simulation ──────────────────────────────────

      case 'playout':
        return this.wasm.play_out(
          (params.model_handle as string)!,
          (params.num_traces as number) ?? 100,
          (params.max_trace_length as number) ?? 100
        );

      case 'monte_carlo_simulation': {
        const mcConfig = {
          num_cases: (params.num_simulations as number) ?? 1000,
          inter_arrival_mean_ms: 1000.0,
          activity_service_time_ms: {},
          resource_capacity: {},
          simulation_time_ms: 60000,
          random_seed: 42,
        };
        return this.wasm.monte_carlo_simulation(
          (params.model_handle as string)!, // log_handle
          '', // powl_handle (not used in current implementation)
          '', // root_id (not used in current implementation)
          JSON.stringify(mcConfig)
        );
      }

      // ─── ML algorithms (TypeScript, not WASM) ────────────────────────────

      case 'ml_classify':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @wasm4pm/ml package. Run 'wpm ml classify ...' instead.`
        );

      case 'ml_cluster':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @wasm4pm/ml package. Run 'wpm ml cluster ...' instead.`
        );

      case 'ml_forecast':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @wasm4pm/ml package. Run 'wpm ml forecast ...' instead.`
        );

      case 'ml_anomaly':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @wasm4pm/ml package. Run 'wpm ml anomaly ...' instead.`
        );

      case 'ml_regress':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @wasm4pm/ml package. Run 'wpm ml regress ...' instead.`
        );

      case 'ml_pca':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @wasm4pm/ml package. Run 'wpm ml pca ...' instead.`
        );

      default:
        throw new Error(`Unsupported algorithm: ${algorithmId}`);
    }
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
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
}
