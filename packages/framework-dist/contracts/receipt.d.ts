/**
 * Receipt types and interfaces for process mining runtime
 * Schema version 1.0
 *
 * Provides cryptographic proof of execution with BLAKE3 hashing.
 * Deterministic: sorted keys ensure same input → same hash.
 */
import { z } from 'zod';
export declare const ErrorInfoSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    stack: z.ZodOptional<z.ZodString>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    context?: Record<string, unknown> | undefined;
    stack?: string | undefined;
}, {
    code: string;
    message: string;
    context?: Record<string, unknown> | undefined;
    stack?: string | undefined;
}>;
/**
 * Error information included in receipts for failed executions
 */
export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;
export declare const ExecutionSummarySchema: z.ZodObject<{
    traces_processed: z.ZodNumber;
    objects_processed: z.ZodNumber;
    variants_discovered: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    traces_processed: number;
    objects_processed: number;
    variants_discovered: number;
}, {
    traces_processed: number;
    objects_processed: number;
    variants_discovered: number;
}>;
/**
 * Summary of processing results
 */
export type ExecutionSummary = z.infer<typeof ExecutionSummarySchema>;
export declare const AlgorithmInfoSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodString;
    parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    version: string;
    name: string;
    parameters: Record<string, unknown>;
}, {
    version: string;
    name: string;
    parameters: Record<string, unknown>;
}>;
/**
 * Algorithm details captured at execution time
 */
export type AlgorithmInfo = z.infer<typeof AlgorithmInfoSchema>;
export declare const ModelInfoSchema: z.ZodObject<{
    nodes: z.ZodNumber;
    edges: z.ZodNumber;
    artifacts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    nodes: number;
    edges: number;
    artifacts?: Record<string, string> | undefined;
}, {
    nodes: number;
    edges: number;
    artifacts?: Record<string, string> | undefined;
}>;
/**
 * Generated model information
 */
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export declare const ExecutionProfileSchema: z.ZodObject<{
    peak_memory_bytes: z.ZodNumber;
    phase_timings: z.ZodArray<z.ZodObject<{
        phase: z.ZodString;
        duration_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        phase: string;
        duration_ms: number;
    }, {
        phase: string;
        duration_ms: number;
    }>, "many">;
    cpu_time_ms: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    peak_memory_bytes: number;
    phase_timings: {
        phase: string;
        duration_ms: number;
    }[];
    cpu_time_ms?: number | undefined;
}, {
    peak_memory_bytes: number;
    phase_timings: {
        phase: string;
        duration_ms: number;
    }[];
    cpu_time_ms?: number | undefined;
}>;
/**
 * Execution profile — performance and resource usage breakdown
 */
export type ExecutionProfile = z.infer<typeof ExecutionProfileSchema>;
export declare const ReceiptSchema: z.ZodObject<{
    run_id: z.ZodString;
    trace_id: z.ZodString;
    schema_version: z.ZodString;
    config_hash: z.ZodString;
    input_hash: z.ZodString;
    plan_hash: z.ZodString;
    output_hash: z.ZodString;
    start_time: z.ZodString;
    end_time: z.ZodString;
    duration_ms: z.ZodNumber;
    status: z.ZodEnum<["success", "partial", "failed"]>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        stack: z.ZodOptional<z.ZodString>;
        context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        context?: Record<string, unknown> | undefined;
        stack?: string | undefined;
    }, {
        code: string;
        message: string;
        context?: Record<string, unknown> | undefined;
        stack?: string | undefined;
    }>>;
    summary: z.ZodObject<{
        traces_processed: z.ZodNumber;
        objects_processed: z.ZodNumber;
        variants_discovered: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        traces_processed: number;
        objects_processed: number;
        variants_discovered: number;
    }, {
        traces_processed: number;
        objects_processed: number;
        variants_discovered: number;
    }>;
    algorithm: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        version: string;
        name: string;
        parameters: Record<string, unknown>;
    }, {
        version: string;
        name: string;
        parameters: Record<string, unknown>;
    }>;
    model: z.ZodObject<{
        nodes: z.ZodNumber;
        edges: z.ZodNumber;
        artifacts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        nodes: number;
        edges: number;
        artifacts?: Record<string, string> | undefined;
    }, {
        nodes: number;
        edges: number;
        artifacts?: Record<string, string> | undefined;
    }>;
    profile: z.ZodOptional<z.ZodObject<{
        peak_memory_bytes: z.ZodNumber;
        phase_timings: z.ZodArray<z.ZodObject<{
            phase: z.ZodString;
            duration_ms: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            phase: string;
            duration_ms: number;
        }, {
            phase: string;
            duration_ms: number;
        }>, "many">;
        cpu_time_ms: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        peak_memory_bytes: number;
        phase_timings: {
            phase: string;
            duration_ms: number;
        }[];
        cpu_time_ms?: number | undefined;
    }, {
        peak_memory_bytes: number;
        phase_timings: {
            phase: string;
            duration_ms: number;
        }[];
        cpu_time_ms?: number | undefined;
    }>>;
    signature: z.ZodOptional<z.ZodString>;
    signer_pubkey: z.ZodOptional<z.ZodString>;
    sig_algorithm: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "success" | "partial" | "failed";
    model: {
        nodes: number;
        edges: number;
        artifacts?: Record<string, string> | undefined;
    };
    schema_version: string;
    duration_ms: number;
    run_id: string;
    trace_id: string;
    config_hash: string;
    input_hash: string;
    plan_hash: string;
    output_hash: string;
    start_time: string;
    end_time: string;
    summary: {
        traces_processed: number;
        objects_processed: number;
        variants_discovered: number;
    };
    algorithm: {
        version: string;
        name: string;
        parameters: Record<string, unknown>;
    };
    error?: {
        code: string;
        message: string;
        context?: Record<string, unknown> | undefined;
        stack?: string | undefined;
    } | undefined;
    profile?: {
        peak_memory_bytes: number;
        phase_timings: {
            phase: string;
            duration_ms: number;
        }[];
        cpu_time_ms?: number | undefined;
    } | undefined;
    signature?: string | undefined;
    signer_pubkey?: string | undefined;
    sig_algorithm?: string | undefined;
}, {
    status: "success" | "partial" | "failed";
    model: {
        nodes: number;
        edges: number;
        artifacts?: Record<string, string> | undefined;
    };
    schema_version: string;
    duration_ms: number;
    run_id: string;
    trace_id: string;
    config_hash: string;
    input_hash: string;
    plan_hash: string;
    output_hash: string;
    start_time: string;
    end_time: string;
    summary: {
        traces_processed: number;
        objects_processed: number;
        variants_discovered: number;
    };
    algorithm: {
        version: string;
        name: string;
        parameters: Record<string, unknown>;
    };
    error?: {
        code: string;
        message: string;
        context?: Record<string, unknown> | undefined;
        stack?: string | undefined;
    } | undefined;
    profile?: {
        peak_memory_bytes: number;
        phase_timings: {
            phase: string;
            duration_ms: number;
        }[];
        cpu_time_ms?: number | undefined;
    } | undefined;
    signature?: string | undefined;
    signer_pubkey?: string | undefined;
    sig_algorithm?: string | undefined;
}>;
/**
 * Runtime receipt - BLAKE3-hashed proof of execution (unsigned)
 * Schema version 1.1
 */
export type Receipt = z.infer<typeof ReceiptSchema>;
/**
 * Format a Receipt as a human-readable one-liner for practitioner QoL.
 *
 * A practitioner glancing at a saved result file should immediately see:
 *   what ran | what data | how many traces/variants | how long | outcome
 *
 * Without this, they must parse 64-char BLAKE3 hex strings to reconstruct context.
 *
 * Example output:
 *   "dfg on xes [342 traces, 8 variants, 47 edges] — 47ms — success [run: a3f8b2c1]"
 *
 * The short run_id prefix (8 chars) is enough for log correlation without
 * overwhelming the terminal line. Full hashes are already in the receipt JSON.
 */
export declare function formatReceipt(receipt: Receipt): string;
/**
 * Type guard to check if a value is a valid Receipt
 */
export declare function isReceipt(value: unknown): value is Receipt;
export declare const ReceiptDiffSchema: z.ZodObject<{
    same: z.ZodBoolean;
    run_id: z.ZodOptional<z.ZodObject<{
        a: z.ZodString;
        b: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        a: string;
        b: string;
    }, {
        a: string;
        b: string;
    }>>;
    trace_id: z.ZodOptional<z.ZodObject<{
        a: z.ZodString;
        b: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        a: string;
        b: string;
    }, {
        a: string;
        b: string;
    }>>;
    status: z.ZodOptional<z.ZodObject<{
        a: z.ZodEnum<["success", "partial", "failed"]>;
        b: z.ZodEnum<["success", "partial", "failed"]>;
    }, "strip", z.ZodTypeAny, {
        a: "success" | "partial" | "failed";
        b: "success" | "partial" | "failed";
    }, {
        a: "success" | "partial" | "failed";
        b: "success" | "partial" | "failed";
    }>>;
    algorithm: z.ZodOptional<z.ZodObject<{
        a: z.ZodString;
        b: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        a: string;
        b: string;
    }, {
        a: string;
        b: string;
    }>>;
    duration_ms: z.ZodOptional<z.ZodObject<{
        a: z.ZodNumber;
        b: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        a: number;
        b: number;
    }, {
        a: number;
        b: number;
    }>>;
    hashes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        a: z.ZodString;
        b: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        a: string;
        b: string;
        field: string;
    }, {
        a: string;
        b: string;
        field: string;
    }>, "many">>;
    summary: z.ZodOptional<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        a: z.ZodNumber;
        b: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        a: number;
        b: number;
        field: string;
    }, {
        a: number;
        b: number;
        field: string;
    }>, "many">>;
    model: z.ZodOptional<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        a: z.ZodNumber;
        b: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        a: number;
        b: number;
        field: string;
    }, {
        a: number;
        b: number;
        field: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    same: boolean;
    status?: {
        a: "success" | "partial" | "failed";
        b: "success" | "partial" | "failed";
    } | undefined;
    model?: {
        a: number;
        b: number;
        field: string;
    }[] | undefined;
    duration_ms?: {
        a: number;
        b: number;
    } | undefined;
    run_id?: {
        a: string;
        b: string;
    } | undefined;
    trace_id?: {
        a: string;
        b: string;
    } | undefined;
    summary?: {
        a: number;
        b: number;
        field: string;
    }[] | undefined;
    algorithm?: {
        a: string;
        b: string;
    } | undefined;
    hashes?: {
        a: string;
        b: string;
        field: string;
    }[] | undefined;
}, {
    same: boolean;
    status?: {
        a: "success" | "partial" | "failed";
        b: "success" | "partial" | "failed";
    } | undefined;
    model?: {
        a: number;
        b: number;
        field: string;
    }[] | undefined;
    duration_ms?: {
        a: number;
        b: number;
    } | undefined;
    run_id?: {
        a: string;
        b: string;
    } | undefined;
    trace_id?: {
        a: string;
        b: string;
    } | undefined;
    summary?: {
        a: number;
        b: number;
        field: string;
    }[] | undefined;
    algorithm?: {
        a: string;
        b: string;
    } | undefined;
    hashes?: {
        a: string;
        b: string;
        field: string;
    }[] | undefined;
}>;
/**
 * Diff between two receipts — describes fields that diverge.
 *
 * All fields except `same` are optional; they are only present when the
 * corresponding property differs between `a` and `b`.
 */
export type ReceiptDiff = z.infer<typeof ReceiptDiffSchema>;
/**
 * Validate that an unknown value satisfies the full Receipt schema contract.
 *
 * More strict than `isReceipt`: also verifies that hash fields are exactly 64
 * hex characters (BLAKE3 output), that timestamps parse as ISO-8601, and that
 * numeric fields are within expected ranges.
 *
 * @param receipt Value to validate
 * @returns true if `receipt` is a well-formed Receipt
 *
 * @example
 * ```ts
 * const raw = JSON.parse(fs.readFileSync('result.json', 'utf8'));
 * if (validateReceiptSchema(raw)) {
 *   // raw is Receipt
 * }
 * ```
 */
export declare function validateReceiptSchema(receipt: unknown): receipt is Receipt;
/**
 * Check whether a receipt is older than a given maximum age.
 *
 * Uses `end_time` (the completion timestamp) as the reference point.
 * Returns true if the receipt has "expired" — i.e. its end_time is more
 * than `maxAgeMs` milliseconds ago relative to the current wall clock.
 *
 * @param receipt Receipt to inspect
 * @param maxAgeMs Maximum acceptable age in milliseconds
 * @returns true if the receipt end_time is more than maxAgeMs ms ago
 *
 * @example
 * ```ts
 * const ONE_HOUR = 60 * 60 * 1000;
 * if (isReceiptExpired(receipt, ONE_HOUR)) {
 *   // Stale — re-run discovery
 * }
 * ```
 */
export declare function isReceiptExpired(receipt: Receipt, maxAgeMs: number): boolean;
/**
 * Produce a concise, human-readable one-line summary of a receipt.
 *
 * Alias of `formatReceipt` — provided under the name `receiptSummary` so callers
 * looking for a "summary" function find it without knowing the internal naming.
 * Returns a non-empty string suitable for logs, CLI output, or diagnostics.
 *
 * @param receipt Receipt to summarize
 * @returns A non-empty one-line summary string
 *
 * @example
 * ```ts
 * console.log(receiptSummary(receipt));
 * // "dfg [342 traces, 8 variants, 5 nodes, 12 edges] — 47ms — ok [run: a3f8b2c1]"
 * ```
 */
export declare function receiptSummary(receipt: Receipt): string;
/**
 * Compare two receipts and return a structured diff of their differences.
 *
 * Useful for detecting result drift between runs, verifying re-runs are
 * deterministic, or reporting what changed after an algorithm upgrade.
 *
 * Hash comparisons are exact (bit-for-bit). Numeric comparisons use a 1ms
 * tolerance for `duration_ms` to absorb measurement noise.
 *
 * @param a First receipt
 * @param b Second receipt
 * @returns A {@link ReceiptDiff} object; `same: true` means no differences found
 *
 * @example
 * ```ts
 * const diff = compareReceipts(receiptA, receiptB);
 * if (!diff.same) {
 *   console.warn('Receipts differ:', diff);
 * }
 * ```
 */
export declare function compareReceipts(a: Receipt, b: Receipt): ReceiptDiff;
/**
 * JSON Schema for Receipt (for external validation)
 */
export declare const RECEIPT_JSON_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://wasm4pm.dev/schemas/receipt/1.1";
    readonly title: "Receipt";
    readonly description: "Cryptographic proof of execution";
    readonly type: "object";
    readonly required: readonly ["run_id", "trace_id", "schema_version", "config_hash", "input_hash", "plan_hash", "output_hash", "start_time", "end_time", "duration_ms", "status", "summary", "algorithm", "model"];
    readonly properties: {
        readonly run_id: {
            readonly type: "string";
            readonly format: "uuid";
        };
        readonly trace_id: {
            readonly type: "string";
            readonly pattern: "^[0-9a-f]{32}$";
        };
        readonly schema_version: {
            readonly type: "string";
            readonly const: "1.1";
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