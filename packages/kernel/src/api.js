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
import { validateKernelResult } from './validation.js';
import { computeTimeout, detectAlgorithmTier } from './adaptive-timeout.js';
export { ValidationError } from './validation.js';
export { computeTimeout, detectAlgorithmTier } from './adaptive-timeout.js';
/** Default no-op sink — suppresses all spans unless overridden. */
const DEFAULT_SINK = () => { };
/** Hex generator for W3C trace/span IDs. Non-receipt IDs — not BLAKE3. */ // @lint-allow-random
function hexId(length) {
    const bytes = new Uint8Array(length);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    }
    else {
        for (let i = 0; i < length; i++)
            bytes[i] = Math.floor(Math.random() * 256); // @lint-allow-fakery — crypto fallback
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).slice(0, length).join('');
}
export class Kernel {
    constructor(wasmModule, options) {
        this._initialized = false;
        this._handles = new Set();
        this._totalRuns = 0;
        this._cacheHits = 0;
        this._startTime = Date.now();
        this._resultCache = new Map();
        this._spanSink = DEFAULT_SINK;
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
    setSpanSink(sink) {
        this._spanSink = sink;
    }
    /**
     * Set the feedback capture callback.
     * Called after successful algorithm runs to capture quality metrics.
     * Non-blocking (failures are logged but don't affect result).
     */
    setFeedbackCapture(capture) {
        this._feedbackCapture = capture;
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
            throw new KernelError(`Algorithm not found: "${algorithmName}". Available: ${this.registry
                .list()
                .map((a) => a.id)
                .join(', ')}`, 'ALGORITHM_NOT_FOUND', { context: { algorithmName } });
        }
        // Check cache
        const cacheKey = hashOutput({ algorithmName, eventLogHandle, params });
        const cached = this._resultCache.get(cacheKey);
        if (cached) {
            this._cacheHits++;
            try {
                const hitTime = Date.now() * 1000000;
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
            }
            catch {
                // Never block on OTEL
            }
            return cached;
        }
        const activityKey = params.activity_key ?? 'concept:name';
        // ── Compute adaptive timeout ───────────────────────────────────────────
        // Timeout is based on log size, complexity, and algorithm tier.
        // We estimate complexity as 'simple' here (no heuristics available at dispatch time);
        // the actual complexity could be refined with log statistics if available.
        const estimatedEventCount = params.estimated_event_count ?? 10000;
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
        const spanStartNs = Date.now() * 1000000;
        const startTime = performance.now();
        let wasmResult;
        let spanStatus = 'OK';
        let spanErrorMessage;
        try {
            wasmResult = await wrapKernelCall(() => this.dispatchAlgorithm(algorithmName, eventLogHandle, activityKey, params), { algorithm: algorithmName });
        }
        catch (err) {
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
                    end_time: Date.now() * 1000000,
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
            }
            catch {
                // Never block on OTEL — per TPS fail-fast rules the underlying error
                // is already re-thrown; the span emission failure is discarded.
            }
            throw err;
        }
        const durationMs = performance.now() - startTime;
        this._totalRuns++;
        this._handles.add(wasmResult.handle);
        const result = {
            handle: wasmResult.handle,
            algorithm: algorithmName,
            outputType: metadata.outputType,
            durationMs,
            execution_ms: durationMs,
            params: { activity_key: activityKey, ...params },
            hash: hashAlgorithmResult(algorithmName, { activity_key: activityKey, ...params }, {
                handle: wasmResult.handle,
                outputType: metadata.outputType,
            }),
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
                end_time: Math.max(Date.now() * 1000000, spanStartNs + 1000000),
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
        }
        catch {
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
     * Estimate log size from handle (for feedback purposes).
     * This is a heuristic; exact size calculation would require WASM introspection.
     * Returns a reasonable estimate based on handle if available.
     */
    getLogSizeHint(_handle) {
        // Heuristic: if WASM exposes a stats function, call it
        // For now, return 0 (unknown) — callers should enrich with actual size
        return 0;
    }
    /**
     * Dispatch to the correct WASM function based on algorithm ID
     */
    async dispatchAlgorithm(algorithmId, eventLogHandle, activityKey, params) {
        switch (algorithmId) {
            case 'dfg':
            case 'hierarchical_dfg':
            case 'streaming_log':
                return this.wasm.discover_dfg(eventLogHandle, activityKey);
            case 'smart_engine': {
                const engineHandle = await this.getSmartEngine();
                const traces = this.wasm.get_traces ? this.wasm.get_traces(eventLogHandle, activityKey) : [];
                const resultJson = this.wasm.smart_engine_run
                    ? this.wasm.smart_engine_run(engineHandle, params.algorithm ?? 'dfg', JSON.stringify(traces))
                    : await this.wasm.discover_dfg(eventLogHandle, activityKey);
                // If it's a discovery-style algorithm, the smart engine might return a handle or JSON.
                // The Kernel contract expects a handle for discovery algorithms.
                if (typeof resultJson === 'string' && resultJson.startsWith('{')) {
                    // It's JSON (analytics), we need to store it and return a "virtual" handle
                    // or just pass it through if the caller expects JSON.
                    // For now, let's assume smart_engine is used as a discovery wrapper.
                    return { handle: resultJson }; // This is a bit of a hack, but fits the 'discover' return type
                }
                return typeof resultJson === 'string' ? { handle: resultJson } : resultJson;
            }
            // SIMD-accelerated DFG — dispatches to the dedicated vectorised WASM export,
            // not the standard discover_dfg. A practitioner who selects this algorithm
            // explicitly wants the ~500x throughput uplift; silently downgrading to the
            // standard DFG defeats the purpose.
            case 'simd_streaming_dfg':
                return this.wasm.discover_dfg_simd(eventLogHandle, activityKey);
            case 'process_skeleton':
                return this.wasm.extract_process_skeleton(eventLogHandle, activityKey, params.min_frequency ?? 2);
            case 'alpha_plus_plus':
                if (this.wasm.discover_alpha_ppp_wasm) {
                    return await this.wasm.discover_alpha_ppp_wasm(eventLogHandle, activityKey, 0, // absolute_df_clean_thresh (min_support handles this at high level)
                    params.causal_threshold ?? 0.8);
                }
                return await this.wasm.discover_alpha_plus_plus(eventLogHandle, activityKey, params.min_support ?? 0.0);
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
                return this.wasm.discover_ilp_petri_net(eventLogHandle, activityKey);
            case 'aco':
                return this.wasm.discover_ant_colony(eventLogHandle, activityKey, params.colony_size ?? 40, params.iterations ?? 100);
            case 'simulated_annealing':
                return this.wasm.discover_simulated_annealing(eventLogHandle, activityKey, params.initial_temperature ?? 100, params.cooling_rate ?? 0.95);
            case 'declare':
                return this.wasm.discover_declare(eventLogHandle, activityKey, params.support_threshold ?? 0.8);
            case 'optimized_dfg':
                return this.wasm.discover_dfg(eventLogHandle, activityKey);
            // ─── Wave 1 Migration: Discovery algorithms ───────────────────────
            case 'transition_system':
                return this.wasm.discover_transition_system(eventLogHandle, params.window ?? 1, params.direction ?? 'forward');
            case 'log_to_trie':
                return this.wasm.discover_prefix_tree(eventLogHandle, activityKey);
            case 'causal_graph':
                return this.wasm.discover_causal_graph(eventLogHandle, activityKey, params.method ?? 'heuristic', params.dependency_threshold ?? 0.5);
            case 'performance_spectrum':
                return this.wasm.discover_performance_spectrum(eventLogHandle, activityKey, params.timestamp_key ?? 'time:timestamp');
            case 'batches':
                return this.wasm.discover_batches(eventLogHandle, activityKey, params.timestamp_key ?? 'time:timestamp', params.batch_threshold ?? 86400000);
            case 'correlation_miner':
                return this.wasm.discover_correlation(eventLogHandle, activityKey, params.timestamp_key ?? 'time:timestamp');
            // ─── Wave 1 Migration: Conformance algorithms ──────────────────────
            case 'generalization':
                return this.wasm.generalization(eventLogHandle, params.petri_net_handle, activityKey);
            case 'petri_net_reduction':
                return this.wasm.reduce_petri_net(params.petri_net_handle);
            case 'etconformance_precision':
            case 'precision':
                return this.wasm.wasm_compute_precision(eventLogHandle, params.petri_net_handle, activityKey);
            case 'compute_simplicity': {
                this.wasm.wasm_compute_simplicity(params.places ?? 0, params.transitions ?? 0, params.arcs ?? 0);
                return { handle: `simplicity_${Date.now()}` };
            }
            case 'alignments': {
                const costConfig = JSON.stringify({
                    sync_cost: params.sync_cost ?? 0,
                    log_move_cost: params.log_move_cost ?? 1,
                    model_move_cost: params.model_move_cost ?? 1,
                });
                return this.wasm.compute_optimal_alignments(eventLogHandle, params.petri_net_handle, activityKey, costConfig);
            }
            // ─── Wave 1 Migration: Quality metrics ───────────────────────────────
            case 'complexity_metrics':
                return this.wasm.measure_complexity(params.powl_handle);
            // ─── Wave 1 Migration: Model conversion ────────────────────────────
            case 'pnml_import':
                return this.wasm.from_pnml(params.pnml_xml);
            case 'bpmn_import':
                return this.wasm.read_bpmn(params.bpmn_xml);
            case 'powl_to_process_tree':
                return this.wasm.powl_to_process_tree(params.powl_handle);
            case 'yawl_export': {
                const xml = await this.wasm.powl_to_yawl_string(params.powl_string);
                return { handle: `yawl_${Date.now()}`, ...JSON.parse(xml) };
            }
            // ─── Wave 1 Migration: Simulation ──────────────────────────────────
            case 'playout':
                return this.wasm.play_out(params.model_handle, params.num_traces ?? 100, params.max_trace_length ?? 100);
            case 'monte_carlo_simulation': {
                const mcConfig = {
                    num_cases: params.num_simulations ?? 1000,
                    inter_arrival_mean_ms: 1000.0,
                    activity_service_time_ms: {},
                    resource_capacity: {},
                    simulation_time_ms: 60000,
                    random_seed: 42,
                };
                return this.wasm.monte_carlo_simulation(params.model_handle, // log_handle
                '', // powl_handle (not used in current implementation)
                '', // root_id (not used in current implementation)
                JSON.stringify(mcConfig));
            }
            // ─── Social network mining (van der Aalst organisational perspective) ──
            // Surfaces the two social network WASM exports that were previously dead
            // (exported from Rust but unreachable from TypeScript). The organisational
            // perspective is a first-class van der Aalst dimension: who does what, and
            // how do resources hand over work to each other?
            case 'handover_network':
                return this.wasm.discover_handover_network(eventLogHandle, params.resource_key ?? 'org:resource');
            case 'working_together_network':
                return this.wasm.discover_working_together_network(eventLogHandle, params.resource_key ?? 'org:resource');
            // ─── OCEL (Object-Centric Event Log) algorithms ──────────────────────
            case 'ocel_dfg': {
                if (!this.wasm.discover_ocel_dfg) {
                    throw new Error('discover_ocel_dfg is not available (requires feature-ocel)');
                }
                return await this.wasm.discover_ocel_dfg(eventLogHandle);
            }
            case 'ocel_dfg_per_type': {
                if (!this.wasm.discover_ocel_dfg_per_type) {
                    throw new Error('discover_ocel_dfg_per_type is not available (requires feature-ocel)');
                }
                return await this.wasm.discover_ocel_dfg_per_type(eventLogHandle);
            }
            case 'ocel_petri_net': {
                const fn = this.wasm.discover_oc_petri_net;
                if (!fn)
                    throw new Error('discover_oc_petri_net is not available (requires feature-ocel)');
                const algorithm = params.algorithm ?? 'inductive';
                fn.call(this.wasm, eventLogHandle, algorithm);
                return { handle: `ocel_petri_net_${Date.now()}` };
            }
            case 'ocel_ocla': {
                const fn = this.wasm.discover_ocla_wasm;
                if (!fn)
                    throw new Error('discover_ocla_wasm is not available (requires feature-ocel)');
                fn.call(this.wasm, eventLogHandle);
                return { handle: `ocel_ocla_${Date.now()}` };
            }
            case 'ocel_oc_declare': {
                const fn = this.wasm.discover_oc_declare_wasm;
                if (!fn)
                    throw new Error('discover_oc_declare_wasm is not available (requires feature-ocel)');
                const thresh = params.noise_threshold ?? 0.1;
                await fn.call(this.wasm, eventLogHandle, thresh);
                return { handle: `ocel_oc_declare_${Date.now()}` };
            }
            case 'ocel_encode': {
                const fn = this.wasm.encode_ocel_as_text;
                if (!fn)
                    throw new Error('encode_ocel_as_text is not available (requires feature-ocel)');
                await fn.call(this.wasm, eventLogHandle);
                return { handle: `ocel_encode_${Date.now()}` };
            }
            // ─── Analytics (Wave 2) ──────────────────────────────────────────────
            case 'detect_drift': {
                const json = this.wasm.detect_drift(eventLogHandle, activityKey, params.window_size ?? 50);
                return { handle: `drift_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            case 'compute_ewma': {
                const json = this.wasm.compute_ewma(params.values_json, params.alpha ?? 0.3);
                return { handle: `ewma_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            case 'analyze_variant_complexity': {
                const json = this.wasm.analyze_variant_complexity(eventLogHandle, activityKey);
                return { handle: `complexity_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            case 'compute_activity_transition_matrix': {
                const json = this.wasm.compute_activity_transition_matrix(eventLogHandle, activityKey);
                return { handle: `transition_matrix_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            case 'analyze_process_speedup': {
                const json = this.wasm.analyze_process_speedup(eventLogHandle, params.timestamp_key ?? 'time:timestamp', params.window_size ?? 10);
                return { handle: `speedup_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            case 'compute_trace_similarity_matrix': {
                const json = this.wasm.compute_trace_similarity_matrix(eventLogHandle, activityKey);
                return { handle: `similarity_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            case 'automl_classify': {
                const json = await this.wasm.discover_automl_classify(eventLogHandle, activityKey);
                return { handle: `automl_classify_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            case 'automl_forecast': {
                const json = await this.wasm.discover_automl_forecast(eventLogHandle, activityKey);
                return { handle: `automl_forecast_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            case 'automl_regress': {
                const json = await this.wasm.discover_ml_regress_automl(eventLogHandle, activityKey);
                return { handle: `automl_regress_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            case 'agentic_pipeline': {
                const json = await this.wasm.run_agentic_pipeline(params.task_json ?? '{}');
                return { handle: `agentic_pipeline_${Date.now()}`, metadata: { result: JSON.parse(json) } };
            }
            // ─── ML algorithms (Restored WASM paths) ─────────────────────────────
            case 'ml_classify':
                if (this.wasm.discover_ml_classify) {
                    return await this.wasm.discover_ml_classify(eventLogHandle, activityKey);
                }
                throw new Error(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`);
            case 'ml_cluster':
                if (this.wasm.discover_ml_cluster) {
                    return await this.wasm.discover_ml_cluster(eventLogHandle, activityKey);
                }
                throw new Error(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`);
            case 'ml_forecast':
                if (this.wasm.discover_ml_forecast) {
                    return await this.wasm.discover_ml_forecast(eventLogHandle, activityKey);
                }
                throw new Error(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`);
            case 'ml_anomaly':
                if (this.wasm.discover_ml_anomaly) {
                    return await this.wasm.discover_ml_anomaly(eventLogHandle, activityKey);
                }
                throw new Error(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`);
            case 'ml_regress':
                if (this.wasm.discover_ml_regress) {
                    return await this.wasm.discover_ml_regress(eventLogHandle, activityKey);
                }
                throw new Error(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`);
            case 'ml_pca':
                if (this.wasm.discover_ml_pca) {
                    return await this.wasm.discover_ml_pca(eventLogHandle, activityKey);
                }
                throw new Error(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`);
            // ─── Prediction (Stubs preserved for high-level package requirement) ─
            case 'predict_next_activity':
            case 'predict_remaining_time':
            case 'predict_outcome':
                throw new Error(`Prediction algorithm '${algorithmId}' requires the @wasm4pm/predict package. ` +
                    `Use the CLI command: wpm predict ...`);
            default:
                throw new Error(`Unsupported algorithm: ${algorithmId}`);
        }
    }
    /**
     * Get or create the global SmartEngine handle for this kernel instance.
     */
    async getSmartEngine() {
        if (!this._smartEngineHandle && this.wasm.smart_engine_create) {
            try {
                this._smartEngineHandle = this.wasm.smart_engine_create();
            }
            catch (e) {
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
export function parseWasmOutput(raw) {
    return (typeof raw === 'string' ? JSON.parse(raw) : raw);
}
//# sourceMappingURL=api.js.map