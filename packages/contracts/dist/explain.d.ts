/**
 * Explain Snapshot Schema
 * Schema version 1.0
 *
 * An explain snapshot captures the complete execution result for
 * introspection/debugging. It mirrors the execution result structure
 * exactly, adding provenance and timing information.
 */
import type { Receipt } from './receipt.js';
import type { Plan } from './plan.js';
import type { Status } from './status.js';
/**
 * Timing breakdown for each phase of execution
 */
export interface PhaseTiming {
    /** Phase name */
    phase: string;
    /** ISO 8601 start time */
    start: string;
    /** ISO 8601 end time */
    end: string;
    /** Duration in milliseconds */
    duration_ms: number;
}
/**
 * Resource usage during execution
 */
export interface ResourceUsage {
    /** Peak WASM memory in bytes */
    peak_memory_bytes: number;
    /** Total events processed */
    events_processed: number;
    /** Number of algorithm invocations */
    algorithm_invocations: number;
}
/**
 * Execution profile — detailed performance breakdown
 */
export interface ExecutionProfile {
    /** Per-phase timing breakdown */
    phases: PhaseTiming[];
    /** Resource usage summary */
    resources: ResourceUsage;
    /** Total wall-clock time in ms */
    total_duration_ms: number;
}
/**
 * Explain snapshot — identical structure to execution result,
 * capturing everything needed to reproduce or debug a run
 */
export interface ExplainSnapshot {
    /** Schema version for forward compatibility */
    schema_version: '1.0';
    /** The receipt from this execution */
    receipt: Receipt;
    /** The plan that was executed */
    plan: Plan;
    /** Runtime status at completion */
    status: Status;
    /** Detailed execution profile */
    execution_profile: ExecutionProfile;
    /** BLAKE3 hash of the output artifacts */
    output_hash: string;
    /** ISO 8601 timestamp of snapshot creation */
    captured_at: string;
    /** Environment info for reproducibility */
    environment: {
        /** Node.js / browser / WASI */
        platform: string;
        /** Runtime version */
        runtime_version: string;
        /** wasm4pm package version */
        package_version: string;
    };
}
/**
 * Type guard for ExplainSnapshot objects
 */
export declare function isExplainSnapshot(value: unknown): value is ExplainSnapshot;
/**
 * JSON Schema for ExplainSnapshot (for external validation)
 */
export declare const EXPLAIN_JSON_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://wasm4pm.dev/schemas/explain/1.0";
    readonly title: "ExplainSnapshot";
    readonly description: "Complete execution snapshot for debugging and reproducibility";
    readonly type: "object";
    readonly required: readonly ["schema_version", "receipt", "plan", "status", "execution_profile", "output_hash", "captured_at", "environment"];
    readonly properties: {
        readonly schema_version: {
            readonly type: "string";
            readonly const: "1.0";
        };
        readonly receipt: {
            readonly $ref: "https://wasm4pm.dev/schemas/receipt/1.0";
        };
        readonly plan: {
            readonly $ref: "https://wasm4pm.dev/schemas/plan/1.0";
        };
        readonly status: {
            readonly $ref: "https://wasm4pm.dev/schemas/status/1.0";
        };
        readonly execution_profile: {
            readonly type: "object";
            readonly required: readonly ["phases", "resources", "total_duration_ms"];
            readonly properties: {
                readonly phases: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly required: readonly ["phase", "start", "end", "duration_ms"];
                        readonly properties: {
                            readonly phase: {
                                readonly type: "string";
                            };
                            readonly start: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly end: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly duration_ms: {
                                readonly type: "number";
                                readonly minimum: 0;
                            };
                        };
                        readonly additionalProperties: false;
                    };
                };
                readonly resources: {
                    readonly type: "object";
                    readonly required: readonly ["peak_memory_bytes", "events_processed", "algorithm_invocations"];
                    readonly properties: {
                        readonly peak_memory_bytes: {
                            readonly type: "integer";
                            readonly minimum: 0;
                        };
                        readonly events_processed: {
                            readonly type: "integer";
                            readonly minimum: 0;
                        };
                        readonly algorithm_invocations: {
                            readonly type: "integer";
                            readonly minimum: 0;
                        };
                    };
                    readonly additionalProperties: false;
                };
                readonly total_duration_ms: {
                    readonly type: "number";
                    readonly minimum: 0;
                };
            };
            readonly additionalProperties: false;
        };
        readonly output_hash: {
            readonly type: "string";
            readonly pattern: "^[0-9a-f]{64}$";
        };
        readonly captured_at: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly environment: {
            readonly type: "object";
            readonly required: readonly ["platform", "runtime_version", "package_version"];
            readonly properties: {
                readonly platform: {
                    readonly type: "string";
                };
                readonly runtime_version: {
                    readonly type: "string";
                };
                readonly package_version: {
                    readonly type: "string";
                };
            };
            readonly additionalProperties: false;
        };
    };
    readonly additionalProperties: false;
};
//# sourceMappingURL=explain.d.ts.map