/**
 * pm4py-backend.ts
 *
 * PM4PY backend stub for Python-based process mining.
 * This is a placeholder. Agent 5 will implement the full backend.
 *
 * Spec reference: Section 3.3 (Pm4pyBackend declaration)
 */
/**
 * Derive latency class from estimated duration (ms).
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
 * Pm4pyBackend: PM4PY Python process mining (placeholder).
 *
 * Capabilities:
 * - algorithmFamilies: ["discovery", "conformance"]
 * - latencyClass: "seconds" (Python overhead)
 * - deterministic: true
 * - maxQualityTier: "research"
 * - supportedAlgorithmIds: 4 algorithms (placeholder)
 * - maxConcurrentInvocations: 2
 *
 * STUB: Full implementation by Agent 5.
 */
export class Pm4pyBackend {
    constructor() {
        this.id = 'pm4py';
    }
    /**
     * Get declared capabilities (pure function).
     */
    capabilities() {
        return {
            algorithmFamilies: ['discovery', 'conformance'],
            outputTypes: ['petri_net'],
            environment: {
                browserSafe: false,
                edgeSafe: false,
                requiresPython: true,
                requiresNetwork: false,
            },
            latencyClass: 'seconds',
            deterministic: true,
            maxQualityTier: 'research',
            supportedAlgorithmIds: [
                'alpha_miner',
                'heuristics_miner_pm4py',
                'inductive_miner_pm4py',
                'alignments_pm4py',
            ],
            maxConcurrentInvocations: 2,
        };
    }
    /**
     * Discover a process model from an event log.
     */
    async discover(log, algorithmId, budget) {
        const startMs = Date.now();
        return {
            run_id: this.generateUuid(),
            status: 'failed',
            payload: null,
            error: 'Pm4pyBackend.discover() not yet implemented (Agent 5)',
            latency_ms: Date.now() - startMs,
            latency_class: 'seconds',
            backend_id: this.id,
            invocation_id: this.generateUuid(),
            cycle_seq: 0,
            algorithm_id: algorithmId,
            provenance: this.createProvenance(algorithmId),
            stale: false,
        };
    }
    /**
     * Check conformance between event log and process model.
     */
    async conformance(log, model, budget) {
        const startMs = Date.now();
        return {
            run_id: this.generateUuid(),
            status: 'failed',
            payload: {
                fitness: 0,
                precision: 0,
                generalization: 0,
                simplicity: 0,
            },
            error: 'Pm4pyBackend.conformance() not yet implemented (Agent 5)',
            latency_ms: Date.now() - startMs,
            latency_class: 'seconds',
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
     */
    async analyze(log, task, budget) {
        const startMs = Date.now();
        return {
            run_id: this.generateUuid(),
            status: 'failed',
            payload: null,
            error: 'Pm4pyBackend.analyze() not yet implemented (Agent 5)',
            latency_ms: Date.now() - startMs,
            latency_class: 'seconds',
            backend_id: this.id,
            invocation_id: this.generateUuid(),
            cycle_seq: 0,
            algorithm_id: task.task_type,
            provenance: this.createProvenance(task.task_type),
            stale: false,
        };
    }
    /**
     * Health check: verify PM4PY is available (requires Python).
     */
    async healthCheck() {
        const startMs = Date.now();
        return {
            healthy: false,
            latency_ms: Date.now() - startMs,
            detail: 'Pm4pyBackend health check not implemented (Agent 5)',
        };
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
}
//# sourceMappingURL=pm4py-backend.js.map