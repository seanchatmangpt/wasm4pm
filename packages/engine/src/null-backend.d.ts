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
import type {
  MiningBackend,
  BackendCapabilities,
  ModelIR,
  ConformanceResult,
} from '@wasm4pm/kernel';
/**
 * NullBackend: Fail-open sentinel backend.
 *
 * Always returns status: "failed" with no algorithm execution.
 * Used when health_level = 4 or all candidates filtered out.
 */
export declare class NullBackend implements MiningBackend {
  readonly id = 'null';
  capabilities(): BackendCapabilities;
  discover(): Promise<{
    run_id: `${string}-${string}-${string}-${string}-${string}`;
    status: 'failed';
    payload: ModelIR;
    error: string;
    latency_ms: number;
    latency_class: 'sub_ms';
    backend_id: string;
    invocation_id: `${string}-${string}-${string}-${string}-${string}`;
    cycle_seq: number;
    algorithm_id: string;
    provenance: {
      input_hash: string;
      config_hash: string;
      plan_hash: string;
      output_hash: string;
      combined_hash: string;
      algorithm_id: string;
      algorithm_version: string;
      backend_id: string;
      kernel_version: string;
      wasm_build_hash: string;
    };
  }>;
  conformance(): Promise<{
    run_id: `${string}-${string}-${string}-${string}-${string}`;
    status: 'failed';
    payload: ConformanceResult;
    error: string;
    latency_ms: number;
    latency_class: 'sub_ms';
    backend_id: string;
    invocation_id: `${string}-${string}-${string}-${string}-${string}`;
    cycle_seq: number;
    algorithm_id: string;
    provenance: {
      input_hash: string;
      config_hash: string;
      plan_hash: string;
      output_hash: string;
      combined_hash: string;
      algorithm_id: string;
      algorithm_version: string;
      backend_id: string;
      kernel_version: string;
      wasm_build_hash: string;
    };
  }>;
  analyze(): Promise<{
    run_id: `${string}-${string}-${string}-${string}-${string}`;
    status: 'failed';
    payload: {};
    error: string;
    latency_ms: number;
    latency_class: 'sub_ms';
    backend_id: string;
    invocation_id: `${string}-${string}-${string}-${string}-${string}`;
    cycle_seq: number;
    algorithm_id: string;
    provenance: {
      input_hash: string;
      config_hash: string;
      plan_hash: string;
      output_hash: string;
      combined_hash: string;
      algorithm_id: string;
      algorithm_version: string;
      backend_id: string;
      kernel_version: string;
      wasm_build_hash: string;
    };
  }>;
  healthCheck(): Promise<{
    healthy: boolean;
    latency_ms: number;
    detail: string;
  }>;
}
//# sourceMappingURL=null-backend.d.ts.map
