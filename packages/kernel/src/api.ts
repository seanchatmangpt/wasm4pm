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

/** Result returned from Kernel.run() */
export interface KernelResult {
  /** Opaque handle to the model in WASM memory */
  handle: string;

  /** Algorithm that produced this result */
  algorithm: string;

  /** Output type: dfg, petrinet, declare, tree */
  outputType: string;

  /** Execution time in milliseconds */
  durationMs: number;

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

  constructor(wasmModule: KernelWasmModule) {
    this.wasm = wasmModule;
    this.registry = getRegistry();
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
        `Algorithm not found: "${algorithmName}". Available: ${this.registry.list().map((a) => a.id).join(', ')}`,
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
    const startTime = Date.now();

    const wasmResult = await wrapKernelCall(
      () => this.dispatchAlgorithm(algorithmName, eventLogHandle, activityKey, params),
      { algorithm: algorithmName }
    );

    const durationMs = Date.now() - startTime;
    this._totalRuns++;
    this._handles.add(wasmResult.handle);

    const result: KernelResult = {
      handle: wasmResult.handle,
      algorithm: algorithmName,
      outputType: metadata.outputType,
      durationMs,
      params: { activity_key: activityKey, ...params },
      hash: hashAlgorithmResult(algorithmName, { activity_key: activityKey, ...params }, {
        handle: wasmResult.handle,
        outputType: metadata.outputType,
      }),
    };

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
      throw new KernelError('Kernel not initialized. Call kernel.init() first.', 'KERNEL_NOT_INITIALIZED');
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
        return this.wasm.discover_alpha_plus_plus(eventLogHandle, activityKey);

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
        return this.wasm.discover_ilp_petri_net(
          eventLogHandle,
          activityKey,
          (params.timeout_seconds as number) ?? 30
        );

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
        return this.wasm.discover_dfg(
          eventLogHandle,
          activityKey
        );

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
          (params.petri_net_handle as string)!
        );

      case 'petri_net_reduction':
        return this.wasm.reduce_petri_net(
          (params.petri_net_handle as string)!
        );

      case 'etconformance_precision':
        return this.wasm.precision_etconformance(
          eventLogHandle,
          (params.petri_net_handle as string)!,
          activityKey
        );

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
        return this.wasm.measure_complexity(
          (params.powl_handle as string)!
        );

      // ─── Wave 1 Migration: Model conversion ────────────────────────────

      case 'pnml_import':
        return this.wasm.from_pnml(
          (params.pnml_xml as string)!
        );

      case 'bpmn_import':
        return this.wasm.read_bpmn(
          (params.bpmn_xml as string)!
        );

      case 'powl_to_process_tree':
        return this.wasm.powl_to_process_tree(
          (params.powl_handle as string)!
        );

      case 'yawl_export': {
        const xml = await this.wasm.powl_to_yawl_string(
          (params.powl_string as string)!
        );
        return { handle: `yawl_${Date.now()}`, ...JSON.parse(xml) };
      }

      // ─── Wave 1 Migration: Simulation ──────────────────────────────────

      case 'playout':
        return this.wasm.play_out(
          (params.model_handle as string)!,
          (params.num_traces as number) ?? 100,
          (params.max_trace_length as number) ?? 100
        );

      case 'monte_carlo_simulation':
        // Monte Carlo simulation requires log_handle, powl_handle, root_id, and config_json
        const mcConfig = {
          num_cases: (params.num_simulations as number) ?? 1000,
          inter_arrival_mean_ms: 1000.0,
          activity_service_time_ms: {},
          resource_capacity: {},
          simulation_time_ms: 60000,
          random_seed: 42
        };
        return this.wasm.monte_carlo_simulation(
          (params.model_handle as string)!, // log_handle
          '', // powl_handle (not used in current implementation)
          '', // root_id (not used in current implementation)
          JSON.stringify(mcConfig)
        );

      // ─── ML algorithms (TypeScript, not WASM) ────────────────────────────

      case 'ml_classify':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @pictl/ml package. Run 'pictl ml classify ...' instead.`
        );

      case 'ml_cluster':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @pictl/ml package. Run 'pictl ml cluster ...' instead.`
        );

      case 'ml_forecast':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @pictl/ml package. Run 'pictl ml forecast ...' instead.`
        );

      case 'ml_anomaly':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @pictl/ml package. Run 'pictl ml anomaly ...' instead.`
        );

      case 'ml_regress':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @pictl/ml package. Run 'pictl ml regress ...' instead.`
        );

      case 'ml_pca':
        throw new Error(
          `ML algorithm '${algorithmId}' requires the @pictl/ml package. Run 'pictl ml pca ...' instead.`
        );

      default:
        throw new Error(`Unsupported algorithm: ${algorithmId}`);
    }
  }
}
