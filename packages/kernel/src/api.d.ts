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
export { ValidationError } from './validation.js';
export type { ViolationReport } from './validation.js';
export { computeTimeout, detectAlgorithmTier } from './adaptive-timeout.js';
export type { TimeoutFactors, TimeoutResult } from './adaptive-timeout.js';
export interface KernelSpan {
    trace_id: string;
    span_id: string;
    name: string;
    kind: 'INTERNAL';
    start_time: number;
    end_time: number;
    status: {
        code: 'OK' | 'ERROR';
        message?: string;
    };
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
export interface KernelWasmModule extends WasmModule {
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
/**
 * Optional callback for capturing algorithm feedback (quality metrics).
 * Called after successful discovery runs (non-blocking).
 */
export type FeedbackCapture = (options: {
    algorithm: string;
    logSize: number;
    executionTimeMs: number;
    metrics: {
        fitness?: number;
        precision?: number | null;
        generalization?: number | null;
        simplicity?: number | null;
    };
    metadata?: Record<string, unknown>;
}) => Promise<void>;
export declare class Kernel {
    private wasm;
    private registry;
    private _initialized;
    private _handles;
    private _totalRuns;
    private _cacheHits;
    private _startTime;
    private _resultCache;
    private _spanSink;
    private _feedbackCapture;
    private _smartEngineHandle;
    constructor(wasmModule: KernelWasmModule, options?: {
        spanSink?: SpanSink;
        feedbackCapture?: FeedbackCapture;
    });
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
    setSpanSink(sink: SpanSink): void;
    /**
     * Set the feedback capture callback.
     * Called after successful algorithm runs to capture quality metrics.
     * Non-blocking (failures are logged but don't affect result).
     */
    setFeedbackCapture(capture: FeedbackCapture): void;
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
     * Estimate log size from handle (for feedback purposes).
     * This is a heuristic; exact size calculation would require WASM introspection.
     * Returns a reasonable estimate based on handle if available.
     */
    private getLogSizeHint;
    /**
     * Dispatch to the correct WASM function based on algorithm ID
     */
    private dispatchAlgorithm;
    /**
     * Get or create the global SmartEngine handle for this kernel instance.
     */
    private getSmartEngine;
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
export declare function parseWasmOutput<T = unknown>(raw: unknown): T;
//# sourceMappingURL=api.d.ts.map