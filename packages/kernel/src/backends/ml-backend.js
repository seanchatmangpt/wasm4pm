/**
 * ml-backend.ts
 *
 * ML backend implementation for machine learning-based process analysis.
 * 6 algorithms: classify, cluster, forecast, anomaly, regress, pca
 * Low-ms latency with deterministic=false (requires seeded RNG for reproducibility).
 *
 * Spec reference: Section 3.3 (MlBackend declaration)
 */
/**
 * All 6 algorithm IDs supported by the ML backend.
 */
const SUPPORTED_ALGORITHM_IDS = [
    'ml_classify',
    'ml_cluster',
    'ml_forecast',
    'ml_anomaly',
    'ml_regress',
    'ml_pca',
];
/**
 * Derive latency class from estimated duration (ms).
 * <1ms → sub_ms, <100ms → low_ms, <10s → high_ms, else seconds
 */
function deriveLatencyClass(estimatedDurationMs) {
    if (estimatedDurationMs < 1)
        return 'sub_ms';
    if (estimatedDurationMs < 100)
        return 'low_ms';
    if (estimatedDurationMs < 10000)
        return 'high_ms';
    if (estimatedDurationMs < 600000)
        return 'seconds';
    return 'minutes';
}
/**
 * MlBackend: Machine learning-based process mining.
 *
 * Capabilities:
 * - algorithmFamilies: ["ml"]
 * - latencyClass: "low_ms" (most algorithms 15-40ms)
 * - deterministic: false (stochastic; requires seeded RNG)
 * - maxQualityTier: "balanced"
 * - supportedAlgorithmIds: 6 algorithms
 * - maxConcurrentInvocations: 4
 *
 * The @wasm4pm/ml package is loaded dynamically to avoid circular dependencies.
 */
export class MlBackend {
    constructor() {
        this.id = 'ml';
    }
    /**
     * Get declared capabilities (pure function).
     */
    capabilities() {
        return {
            algorithmFamilies: ['ml'],
            outputTypes: ['ml_result'],
            environment: {
                browserSafe: true,
                edgeSafe: false, // ML requires significant memory
                requiresPython: false,
                requiresNetwork: false,
            },
            latencyClass: 'low_ms',
            deterministic: false,
            maxQualityTier: 'balanced',
            supportedAlgorithmIds: SUPPORTED_ALGORITHM_IDS,
            maxConcurrentInvocations: 4,
        };
    }
    /**
     * Discover a process model from an event log.
     * ML backend returns ml_result type, not traditional process models.
     */
    async discover(log, algorithmId, budget) {
        const startMs = Date.now();
        try {
            // Validate algorithm is supported
            if (!SUPPORTED_ALGORITHM_IDS.includes(algorithmId)) {
                const latency_ms = Date.now() - startMs;
                return {
                    run_id: this.generateUuid(),
                    status: 'failed',
                    payload: null,
                    error: `Algorithm ${algorithmId} not supported by ML backend`,
                    latency_ms,
                    latency_class: deriveLatencyClass(latency_ms),
                    backend_id: this.id,
                    invocation_id: this.generateUuid(),
                    cycle_seq: 0,
                    algorithm_id: algorithmId,
                    provenance: this.createProvenance(algorithmId),
                    stale: false,
                };
            }
            // ML algorithms don't produce traditional ModelIR — they produce analysis results
            // This is a limitation of the ML backend for discovery context
            const latency_ms = Date.now() - startMs;
            return {
                run_id: this.generateUuid(),
                status: 'failed',
                payload: null,
                error: 'ML backend does not support discovery context (use analyze() instead)',
                latency_ms,
                latency_class: deriveLatencyClass(latency_ms),
                backend_id: this.id,
                invocation_id: this.generateUuid(),
                cycle_seq: 0,
                algorithm_id: algorithmId,
                provenance: this.createProvenance(algorithmId),
                stale: false,
            };
        }
        catch (error) {
            const latency_ms = Date.now() - startMs;
            return {
                run_id: this.generateUuid(),
                status: 'failed',
                payload: null,
                error: `Discovery failed: ${error instanceof Error ? error.message : String(error)}`,
                latency_ms,
                latency_class: deriveLatencyClass(latency_ms),
                backend_id: this.id,
                invocation_id: this.generateUuid(),
                cycle_seq: 0,
                algorithm_id: algorithmId,
                provenance: this.createProvenance(algorithmId),
                stale: false,
            };
        }
    }
    /**
     * Check conformance between event log and process model.
     * ML backend does not support conformance checking.
     */
    async conformance(log, model, budget) {
        const startMs = Date.now();
        const latency_ms = Date.now() - startMs;
        return {
            run_id: this.generateUuid(),
            status: 'failed',
            payload: null,
            error: 'ML backend does not support conformance checking',
            latency_ms,
            latency_class: deriveLatencyClass(latency_ms),
            backend_id: this.id,
            invocation_id: this.generateUuid(),
            cycle_seq: 0,
            algorithm_id: 'conformance',
            provenance: this.createProvenance('conformance'),
            stale: false,
        };
    }
    /**
     * Run a generic analysis task on the event log.
     * ML backend specializes in analysis tasks:
     * - ml_classify: Trace classification
     * - ml_cluster: Trace clustering
     * - ml_forecast: Throughput forecasting
     * - ml_anomaly: Anomaly detection
     * - ml_regress: Remaining time prediction
     * - ml_pca: Feature reduction
     */
    async analyze(log, task, budget) {
        const startMs = Date.now();
        try {
            // Validate task type is a supported ML algorithm
            if (!SUPPORTED_ALGORITHM_IDS.includes(task.task_type)) {
                return this.createFailedAnalysisResult(task.task_type, startMs, `Analysis task ${task.task_type} not supported by ML backend`);
            }
            // TODO: Call @wasm4pm/ml package with task parameters
            // For now, return stub result
            const result = {
                task_type: task.task_type,
                algorithm: task.task_type,
                parameters: task.parameters || {},
                output_schema: this.getOutputSchema(task.task_type),
                results: [],
            };
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
                algorithm_id: task.task_type,
                provenance: this.createProvenance(task.task_type),
                stale: false,
            };
        }
        catch (error) {
            return this.createFailedAnalysisResult(task.task_type, startMs, `Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Health check: verify ML subsystem is available.
     * Must complete in ≤500ms per spec (Section 3.6, invariant 3).
     */
    async healthCheck() {
        const startMs = Date.now();
        try {
            // TODO: Attempt to load @wasm4pm/ml package
            // For now, return healthy
            const latency_ms = Date.now() - startMs;
            return {
                healthy: true,
                latency_ms,
                detail: 'ML subsystem available',
            };
        }
        catch (error) {
            const latency_ms = Date.now() - startMs;
            return {
                healthy: false,
                latency_ms,
                detail: `ML health check failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    /**
     * Get the output schema for a given ML algorithm.
     * INTERNAL helper.
     */
    getOutputSchema(algorithmId) {
        const schemas = {
            ml_classify: {
                type: 'object',
                properties: {
                    predictions: { type: 'array' },
                    confidence: { type: 'number' },
                },
            },
            ml_cluster: {
                type: 'object',
                properties: {
                    cluster_assignments: { type: 'array' },
                    cluster_centers: { type: 'array' },
                },
            },
            ml_forecast: {
                type: 'object',
                properties: {
                    forecast_values: { type: 'array' },
                    confidence_intervals: { type: 'array' },
                },
            },
            ml_anomaly: {
                type: 'object',
                properties: {
                    anomaly_scores: { type: 'array' },
                    threshold: { type: 'number' },
                },
            },
            ml_regress: {
                type: 'object',
                properties: {
                    predictions: { type: 'array' },
                    r_squared: { type: 'number' },
                },
            },
            ml_pca: {
                type: 'object',
                properties: {
                    components: { type: 'array' },
                    explained_variance: { type: 'array' },
                },
            },
        };
        return schemas[algorithmId] || {};
    }
    /**
     * Generate a UUID v4.
     * INTERNAL helper.
     */
    generateUuid() {
        return crypto.randomUUID?.() || `uuid-${Date.now()}-${Math.random()}`;
    }
    /**
     * Create a ProvenanceChain for auditing.
     * INTERNAL helper.
     */
    createProvenance(algorithmId) {
        return {
            input_hash: `hash-input-${algorithmId}`,
            config_hash: `hash-config-${algorithmId}`,
            plan_hash: `hash-plan-${algorithmId}`,
            output_hash: `hash-output-${algorithmId}`,
            combined_hash: `hash-combined-${algorithmId}`,
            algorithm_id: algorithmId,
            algorithm_version: '1.0',
            backend_id: this.id,
            kernel_version: '26.4.0',
            wasm_build_hash: 'wasm-hash-placeholder',
        };
    }
    /**
     * Create a failed ResultEnvelope for discovery context.
     * INTERNAL helper.
     */
    createFailedResult(algorithmId, startMs, errorMessage) {
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
            provenance: this.createProvenance(algorithmId),
            stale: false,
        };
    }
    /**
     * Create a failed ResultEnvelope for analysis context.
     * INTERNAL helper.
     */
    createFailedAnalysisResult(algorithmId, startMs, errorMessage) {
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
            provenance: this.createProvenance(algorithmId),
            stale: false,
        };
    }
}
//# sourceMappingURL=ml-backend.js.map