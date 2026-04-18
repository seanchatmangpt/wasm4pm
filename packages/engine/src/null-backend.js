/**
 * null-backend.ts
 *
 * NullBackend: Fail-open sentinel backend (Section 5.4)
 *
 * Always returns status: "failed" with no algorithm execution.
 * Used when health_level = 4 or all candidates filtered out.
 *
 * Spec reference: Section 5.4
 */
import { randomUUID } from 'crypto';
/**
 * NullBackend: Fail-open sentinel backend.
 *
 * Always returns status: "failed" with no algorithm execution.
 * Used when health_level = 4 or all candidates filtered out.
 */
export class NullBackend {
    constructor() {
        this.id = 'null';
    }
    capabilities() {
        return {
            algorithmFamilies: [],
            outputTypes: [],
            environment: {
                browserSafe: true,
                edgeSafe: true,
                requiresPython: false,
                requiresNetwork: false,
            },
            latencyClass: 'sub_ms',
            deterministic: true,
            maxQualityTier: 'fast',
            supportedAlgorithmIds: [],
            maxConcurrentInvocations: 999,
        };
    }
    async discover() {
        return {
            run_id: randomUUID(),
            status: 'failed',
            payload: {},
            error: 'null_backend_no_operation',
            latency_ms: 0,
            latency_class: 'sub_ms',
            backend_id: 'null',
            invocation_id: randomUUID(),
            cycle_seq: 0,
            algorithm_id: '',
            provenance: {
                input_hash: '',
                config_hash: '',
                plan_hash: '',
                output_hash: '',
                combined_hash: '',
                algorithm_id: '',
                algorithm_version: '1.0.0',
                backend_id: 'null',
                kernel_version: '1.0.0',
                wasm_build_hash: '',
            },
        };
    }
    async conformance() {
        return {
            run_id: randomUUID(),
            status: 'failed',
            payload: {},
            error: 'null_backend_no_operation',
            latency_ms: 0,
            latency_class: 'sub_ms',
            backend_id: 'null',
            invocation_id: randomUUID(),
            cycle_seq: 0,
            algorithm_id: '',
            provenance: {
                input_hash: '',
                config_hash: '',
                plan_hash: '',
                output_hash: '',
                combined_hash: '',
                algorithm_id: '',
                algorithm_version: '1.0.0',
                backend_id: 'null',
                kernel_version: '1.0.0',
                wasm_build_hash: '',
            },
        };
    }
    async analyze() {
        return {
            run_id: randomUUID(),
            status: 'failed',
            payload: {},
            error: 'null_backend_no_operation',
            latency_ms: 0,
            latency_class: 'sub_ms',
            backend_id: 'null',
            invocation_id: randomUUID(),
            cycle_seq: 0,
            algorithm_id: '',
            provenance: {
                input_hash: '',
                config_hash: '',
                plan_hash: '',
                output_hash: '',
                combined_hash: '',
                algorithm_id: '',
                algorithm_version: '1.0.0',
                backend_id: 'null',
                kernel_version: '1.0.0',
                wasm_build_hash: '',
            },
        };
    }
    async healthCheck() {
        return {
            healthy: true,
            latency_ms: 0,
            detail: 'null_backend_always_ready',
        };
    }
}
//# sourceMappingURL=null-backend.js.map