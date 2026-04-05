/**
 * api.ts
 * Kernel — versioned TypeScript facade over wasm4pm WASM algorithms
 *
 * Provides: Kernel.version(), Kernel.checkCompatibility(), Kernel.algorithms(),
 * Kernel.run(), Kernel.stream(), Kernel.freeHandle(), Kernel.stats()
 */
import { getRegistry } from './registry.js';
import { KERNEL_VERSION, checkCompatibility } from './versioning.js';
import { hashOutput, hashAlgorithmResult } from './hashing.js';
import { KernelError, wrapKernelCall } from './errors.js';
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
    constructor(wasmModule) {
        this._initialized = false;
        this._handles = new Set();
        this._totalRuns = 0;
        this._cacheHits = 0;
        this._startTime = Date.now();
        this._resultCache = new Map();
        this.wasm = wasmModule;
        this.registry = getRegistry();
    }
    /**
     * Initialize the WASM module
     * Must be called before run() or stream()
     */
    async init() {
        if (this._initialized)
            return;
        await wrapKernelCall(async () => {
            if (this.wasm.init) {
                await this.wasm.init();
            }
        }, { step: 'init' });
        this._initialized = true;
        this._startTime = Date.now();
    }
    /** Get the kernel version string */
    version() {
        return KERNEL_VERSION;
    }
    /**
     * Check if this kernel is compatible with a required version
     * @param requiredVersion - Semver string the caller requires
     */
    checkCompatibility(requiredVersion) {
        return checkCompatibility(requiredVersion);
    }
    /** List all registered algorithms with metadata */
    algorithms() {
        return this.registry.list();
    }
    /** Get algorithms for a specific execution profile */
    algorithmsForProfile(profile) {
        return this.registry.getForProfile(profile);
    }
    /** Look up a single algorithm's metadata */
    algorithm(id) {
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
    async run(algorithmName, eventLogHandle, params = {}) {
        this.assertInitialized();
        const metadata = this.registry.get(algorithmName);
        if (!metadata) {
            throw new KernelError(`Algorithm not found: "${algorithmName}". Available: ${this.registry.list().map((a) => a.id).join(', ')}`, 'ALGORITHM_NOT_FOUND', { context: { algorithmName } });
        }
        // Check cache
        const cacheKey = hashOutput({ algorithmName, eventLogHandle, params });
        const cached = this._resultCache.get(cacheKey);
        if (cached) {
            this._cacheHits++;
            return cached;
        }
        const activityKey = params.activity_key ?? 'concept:name';
        const startTime = Date.now();
        const wasmResult = await wrapKernelCall(() => this.dispatchAlgorithm(algorithmName, eventLogHandle, activityKey, params), { algorithm: algorithmName });
        const durationMs = Date.now() - startTime;
        this._totalRuns++;
        this._handles.add(wasmResult.handle);
        const result = {
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
    async *stream(algorithmName, eventLogHandle, params = {}) {
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
    freeHandle(handle) {
        if (!this._handles.has(handle))
            return;
        try {
            if (this.wasm.delete_object) {
                this.wasm.delete_object(handle);
            }
        }
        catch {
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
    stats() {
        return {
            initialized: this._initialized,
            activeHandles: this._handles.size,
            totalRuns: this._totalRuns,
            cacheHits: this._cacheHits,
            uptimeMs: Date.now() - this._startTime,
        };
    }
    /** Reset the kernel state (clears caches and handles, does not re-init WASM) */
    reset() {
        this._resultCache.clear();
        this._handles.clear();
        this._totalRuns = 0;
        this._cacheHits = 0;
    }
    // ── Private ──────────────────────────────────────────────────────────
    assertInitialized() {
        if (!this._initialized) {
            throw new KernelError('Kernel not initialized. Call kernel.init() first.', 'KERNEL_NOT_INITIALIZED');
        }
    }
    /**
     * Dispatch to the correct WASM function based on algorithm ID
     */
    async dispatchAlgorithm(algorithmId, eventLogHandle, activityKey, params) {
        switch (algorithmId) {
            case 'dfg':
            case 'process_skeleton':
                return this.wasm.discover_dfg(eventLogHandle, activityKey);
            case 'alpha_plus_plus':
                return this.wasm.discover_alpha_plus_plus(eventLogHandle, activityKey);
            case 'heuristic_miner':
                return this.wasm.discover_heuristic_miner(eventLogHandle, activityKey, params.dependency_threshold ?? 0.5);
            case 'inductive_miner':
                return this.wasm.discover_inductive_miner(eventLogHandle, activityKey, params.noise_threshold ?? 0.2);
            case 'genetic_algorithm':
                return this.wasm.discover_genetic_algorithm(eventLogHandle, activityKey, params.population_size ?? 50, params.generations ?? 100);
            case 'pso':
                return this.wasm.discover_pso_algorithm(eventLogHandle, activityKey, params.swarm_size ?? 30, params.iterations ?? 50);
            case 'a_star':
                return this.wasm.discover_astar(eventLogHandle, activityKey, params.max_iterations ?? 10000);
            case 'hill_climbing':
                return this.wasm.discover_hill_climbing(eventLogHandle, activityKey, params.max_iterations ?? 100);
            case 'ilp':
                return this.wasm.discover_ilp_petri_net(eventLogHandle, activityKey, params.timeout_seconds ?? 30);
            case 'aco':
                return this.wasm.discover_ant_colony(eventLogHandle, activityKey, params.colony_size ?? 40, params.iterations ?? 100);
            case 'simulated_annealing':
                return this.wasm.discover_simulated_annealing(eventLogHandle, activityKey, params.initial_temperature ?? 100, params.cooling_rate ?? 0.95);
            case 'declare':
                return this.wasm.discover_declare(eventLogHandle, activityKey, params.support_threshold ?? 0.8);
            case 'optimized_dfg':
                return this.wasm.discover_optimized_dfg(eventLogHandle, activityKey, params.timeout_seconds ?? 15);
            default:
                throw new Error(`Unsupported algorithm: ${algorithmId}`);
        }
    }
}
//# sourceMappingURL=api.js.map