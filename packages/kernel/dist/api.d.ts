/**
 * api.ts
 * Kernel — versioned TypeScript facade over wasm4pm WASM algorithms
 *
 * Provides: Kernel.version(), Kernel.checkCompatibility(), Kernel.algorithms(),
 * Kernel.run(), Kernel.stream(), Kernel.freeHandle(), Kernel.stats()
 */
import type { WasmModule } from './handlers.js';
import type { AlgorithmMetadata, ExecutionProfile } from './registry.js';
import { type CompatibilityResult } from './versioning.js';
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
export declare class Kernel {
    private wasm;
    private registry;
    private _initialized;
    private _handles;
    private _totalRuns;
    private _cacheHits;
    private _startTime;
    private _resultCache;
    constructor(wasmModule: KernelWasmModule);
    /**
     * Initialize the WASM module
     * Must be called before run() or stream()
     */
    init(): Promise<void>;
    /** Get the kernel version string */
    version(): string;
    /**
     * Check if this kernel is compatible with a required version
     * @param requiredVersion - Semver string the caller requires
     */
    checkCompatibility(requiredVersion: string): CompatibilityResult;
    /** List all registered algorithms with metadata */
    algorithms(): AlgorithmMetadata[];
    /** Get algorithms for a specific execution profile */
    algorithmsForProfile(profile: ExecutionProfile): AlgorithmMetadata[];
    /** Look up a single algorithm's metadata */
    algorithm(id: string): AlgorithmMetadata | undefined;
    /**
     * Run a discovery algorithm
     *
     * @param algorithmName - Algorithm ID (e.g. 'dfg', 'alpha_plus_plus', 'genetic_algorithm')
     * @param eventLogHandle - Handle to a loaded event log in WASM memory
     * @param params - Algorithm parameters (activity_key, thresholds, etc.)
     * @returns KernelResult with handle, hash, and metadata
     * @throws KernelError if algorithm not found, WASM call fails, or kernel not initialized
     */
    run(algorithmName: string, eventLogHandle: string, params?: Record<string, unknown>): Promise<KernelResult>;
    /**
     * Stream algorithm results (for algorithms that support incremental output)
     * Falls back to single-shot run with progress simulation for non-streaming algorithms
     */
    stream(algorithmName: string, eventLogHandle: string, params?: Record<string, unknown>): AsyncGenerator<PartialResult>;
    /**
     * Free a handle from WASM memory
     * Safe to call multiple times on the same handle
     */
    freeHandle(handle: string): void;
    /** Get runtime statistics */
    stats(): KernelStats;
    /** Reset the kernel state (clears caches and handles, does not re-init WASM) */
    reset(): void;
    private assertInitialized;
    /**
     * Dispatch to the correct WASM function based on algorithm ID
     */
    private dispatchAlgorithm;
}
//# sourceMappingURL=api.d.ts.map