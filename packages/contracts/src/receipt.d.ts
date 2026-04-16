/**
 * Receipt types and interfaces for process mining runtime
 * Schema version 1.0
 *
 * Provides cryptographic proof of execution with BLAKE3 hashing.
 * Deterministic: sorted keys ensure same input → same hash.
 */
/**
 * Error information included in receipts for failed executions
 */
export interface ErrorInfo {
    code: string;
    message: string;
    stack?: string;
    context?: Record<string, any>;
}
/**
 * Summary of processing results
 */
export interface ExecutionSummary {
    traces_processed: number;
    objects_processed: number;
    variants_discovered: number;
}
/**
 * Algorithm details captured at execution time
 */
export interface AlgorithmInfo {
    name: string;
    version: string;
    parameters: Record<string, any>;
}
/**
 * Generated model information
 */
export interface ModelInfo {
    nodes: number;
    edges: number;
    artifacts?: Record<string, string>;
}
/**
 * Execution profile — performance and resource usage breakdown
 */
export interface ExecutionProfile {
    /** Peak memory usage in bytes */
    peak_memory_bytes: number;
    /** Per-phase timing breakdown */
    phase_timings: {
        phase: string;
        duration_ms: number;
    }[];
    /** Total CPU time in ms (if measurable) */
    cpu_time_ms?: number;
}
/**
 * Runtime receipt - cryptographically signed proof of execution
 * Schema version 1.0
 */
export interface Receipt {
    run_id: string;
    schema_version: string;
    config_hash: string;
    input_hash: string;
    plan_hash: string;
    output_hash: string;
    start_time: string;
    end_time: string;
    duration_ms: number;
    status: 'success' | 'partial' | 'failed';
    error?: ErrorInfo;
    summary: ExecutionSummary;
    algorithm: AlgorithmInfo;
    model: ModelInfo;
    profile?: ExecutionProfile;
}
/**
 * Type guard to check if a value is a valid Receipt
 */
export declare function isReceipt(value: unknown): value is Receipt;
/**
 * JSON Schema for Receipt (for external validation)
 */
export declare const RECEIPT_JSON_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://wasm4pm.dev/schemas/receipt/1.0";
    readonly title: "Receipt";
    readonly description: "Cryptographic proof of execution";
    readonly type: "object";
    readonly required: readonly ["run_id", "schema_version", "config_hash", "input_hash", "plan_hash", "output_hash", "start_time", "end_time", "duration_ms", "status", "summary", "algorithm", "model"];
    readonly properties: {
        readonly run_id: {
            readonly type: "string";
            readonly format: "uuid";
        };
        readonly schema_version: {
            readonly type: "string";
            readonly const: "1.0";
        };
        readonly config_hash: {
            readonly type: "string";
            readonly pattern: "^[0-9a-f]{64}$";
        };
        readonly input_hash: {
            readonly type: "string";
            readonly pattern: "^[0-9a-f]{64}$";
        };
        readonly plan_hash: {
            readonly type: "string";
            readonly pattern: "^[0-9a-f]{64}$";
        };
        readonly output_hash: {
            readonly type: "string";
            readonly pattern: "^[0-9a-f]{64}$";
        };
        readonly start_time: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly end_time: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly duration_ms: {
            readonly type: "number";
            readonly minimum: 0;
        };
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["success", "partial", "failed"];
        };
        readonly error: {
            readonly type: "object";
            readonly properties: {
                readonly code: {
                    readonly type: "string";
                };
                readonly message: {
                    readonly type: "string";
                };
                readonly stack: {
                    readonly type: "string";
                };
                readonly context: {
                    readonly type: "object";
                };
            };
            readonly required: readonly ["code", "message"];
        };
        readonly summary: {
            readonly type: "object";
            readonly required: readonly ["traces_processed", "objects_processed", "variants_discovered"];
            readonly properties: {
                readonly traces_processed: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly objects_processed: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly variants_discovered: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
            };
            readonly additionalProperties: false;
        };
        readonly algorithm: {
            readonly type: "object";
            readonly required: readonly ["name", "version", "parameters"];
            readonly properties: {
                readonly name: {
                    readonly type: "string";
                };
                readonly version: {
                    readonly type: "string";
                };
                readonly parameters: {
                    readonly type: "object";
                };
            };
            readonly additionalProperties: false;
        };
        readonly model: {
            readonly type: "object";
            readonly required: readonly ["nodes", "edges"];
            readonly properties: {
                readonly nodes: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly edges: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly artifacts: {
                    readonly type: "object";
                };
            };
            readonly additionalProperties: false;
        };
        readonly profile: {
            readonly type: "object";
            readonly required: readonly ["peak_memory_bytes", "phase_timings"];
            readonly properties: {
                readonly peak_memory_bytes: {
                    readonly type: "integer";
                    readonly minimum: 0;
                };
                readonly phase_timings: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly required: readonly ["phase", "duration_ms"];
                        readonly properties: {
                            readonly phase: {
                                readonly type: "string";
                            };
                            readonly duration_ms: {
                                readonly type: "number";
                                readonly minimum: 0;
                            };
                        };
                        readonly additionalProperties: false;
                    };
                };
                readonly cpu_time_ms: {
                    readonly type: "number";
                    readonly minimum: 0;
                };
            };
            readonly additionalProperties: false;
        };
    };
    readonly additionalProperties: false;
};
//# sourceMappingURL=receipt.d.ts.map