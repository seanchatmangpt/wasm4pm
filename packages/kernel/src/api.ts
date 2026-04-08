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
      case 'process_skeleton':
      case 'simd_streaming_dfg':
      case 'hierarchical_dfg':
      case 'streaming_log':
      case 'smart_engine':
        return this.wasm.discover_dfg(eventLogHandle, activityKey);

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
        return this.wasm.discover_optimized_dfg(
          eventLogHandle,
          activityKey,
          (params.timeout_seconds as number) ?? 15
        );

      default:
        throw new Error(`Unsupported algorithm: ${algorithmId}`);
    }
  }
}
