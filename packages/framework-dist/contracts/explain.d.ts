/**
 * Explain Snapshot Schema
 * Schema version 1.0
 *
 * An explain snapshot captures the complete execution result for
 * introspection/debugging. It mirrors the execution result structure
 * exactly, adding provenance and timing information.
 */
import { z } from 'zod';
import type { Plan } from './plan.js';
export declare const PhaseTimingSchema: z.ZodObject<{
    phase: z.ZodString;
    start: z.ZodString;
    end: z.ZodString;
    duration_ms: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    phase: string;
    duration_ms: number;
    start: string;
    end: string;
}, {
    phase: string;
    duration_ms: number;
    start: string;
    end: string;
}>;
/**
 * Timing breakdown for each phase of execution
 */
export type PhaseTiming = z.infer<typeof PhaseTimingSchema>;
export declare const ResourceUsageSchema: z.ZodObject<{
    peak_memory_bytes: z.ZodNumber;
    events_processed: z.ZodNumber;
    algorithm_invocations: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    peak_memory_bytes: number;
    events_processed: number;
    algorithm_invocations: number;
}, {
    peak_memory_bytes: number;
    events_processed: number;
    algorithm_invocations: number;
}>;
/**
 * Resource usage during execution
 */
export type ResourceUsage = z.infer<typeof ResourceUsageSchema>;
export declare const ExplainExecutionProfileSchema: z.ZodObject<{
    phases: z.ZodArray<z.ZodObject<{
        phase: z.ZodString;
        start: z.ZodString;
        end: z.ZodString;
        duration_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        phase: string;
        duration_ms: number;
        start: string;
        end: string;
    }, {
        phase: string;
        duration_ms: number;
        start: string;
        end: string;
    }>, "many">;
    resources: z.ZodObject<{
        peak_memory_bytes: z.ZodNumber;
        events_processed: z.ZodNumber;
        algorithm_invocations: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        peak_memory_bytes: number;
        events_processed: number;
        algorithm_invocations: number;
    }, {
        peak_memory_bytes: number;
        events_processed: number;
        algorithm_invocations: number;
    }>;
    total_duration_ms: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    phases: {
        phase: string;
        duration_ms: number;
        start: string;
        end: string;
    }[];
    resources: {
        peak_memory_bytes: number;
        events_processed: number;
        algorithm_invocations: number;
    };
    total_duration_ms: number;
}, {
    phases: {
        phase: string;
        duration_ms: number;
        start: string;
        end: string;
    }[];
    resources: {
        peak_memory_bytes: number;
        events_processed: number;
        algorithm_invocations: number;
    };
    total_duration_ms: number;
}>;
/**
 * Execution profile — detailed performance breakdown
 */
export type ExecutionProfile = z.infer<typeof ExplainExecutionProfileSchema>;
export declare const ExplainSnapshotSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"1.0">;
    receipt: z.ZodObject<{
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
    plan: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    status: z.ZodObject<{
        schema_version: z.ZodLiteral<"1.0">;
        state: z.ZodEnum<["uninitialized", "bootstrapping", "ready", "planning", "running", "watching", "degraded", "failed"]>;
        timestamp: z.ZodString;
        last_transition: z.ZodString;
        previous_state: z.ZodNullable<z.ZodEnum<["uninitialized", "bootstrapping", "ready", "planning", "running", "watching", "degraded", "failed"]>>;
        transition_count: z.ZodNumber;
        run_id: z.ZodNullable<z.ZodString>;
        degradation: z.ZodOptional<z.ZodObject<{
            reason: z.ZodString;
            affected_subsystems: z.ZodArray<z.ZodString, "many">;
            since: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            reason: string;
            affected_subsystems: string[];
            since: string;
        }, {
            reason: string;
            affected_subsystems: string[];
            since: string;
        }>>;
        failure: z.ZodOptional<z.ZodObject<{
            error_code: z.ZodString;
            message: z.ZodString;
            recoverable: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            message: string;
            recoverable: boolean;
            error_code: string;
        }, {
            message: string;
            recoverable: boolean;
            error_code: string;
        }>>;
        uptime_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        schema_version: "1.0";
        run_id: string | null;
        timestamp: string;
        state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
        last_transition: string;
        previous_state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded" | null;
        transition_count: number;
        uptime_ms: number;
        degradation?: {
            reason: string;
            affected_subsystems: string[];
            since: string;
        } | undefined;
        failure?: {
            message: string;
            recoverable: boolean;
            error_code: string;
        } | undefined;
    }, {
        schema_version: "1.0";
        run_id: string | null;
        timestamp: string;
        state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
        last_transition: string;
        previous_state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded" | null;
        transition_count: number;
        uptime_ms: number;
        degradation?: {
            reason: string;
            affected_subsystems: string[];
            since: string;
        } | undefined;
        failure?: {
            message: string;
            recoverable: boolean;
            error_code: string;
        } | undefined;
    }>;
    execution_profile: z.ZodObject<{
        phases: z.ZodArray<z.ZodObject<{
            phase: z.ZodString;
            start: z.ZodString;
            end: z.ZodString;
            duration_ms: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            phase: string;
            duration_ms: number;
            start: string;
            end: string;
        }, {
            phase: string;
            duration_ms: number;
            start: string;
            end: string;
        }>, "many">;
        resources: z.ZodObject<{
            peak_memory_bytes: z.ZodNumber;
            events_processed: z.ZodNumber;
            algorithm_invocations: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            peak_memory_bytes: number;
            events_processed: number;
            algorithm_invocations: number;
        }, {
            peak_memory_bytes: number;
            events_processed: number;
            algorithm_invocations: number;
        }>;
        total_duration_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        phases: {
            phase: string;
            duration_ms: number;
            start: string;
            end: string;
        }[];
        resources: {
            peak_memory_bytes: number;
            events_processed: number;
            algorithm_invocations: number;
        };
        total_duration_ms: number;
    }, {
        phases: {
            phase: string;
            duration_ms: number;
            start: string;
            end: string;
        }[];
        resources: {
            peak_memory_bytes: number;
            events_processed: number;
            algorithm_invocations: number;
        };
        total_duration_ms: number;
    }>;
    output_hash: z.ZodString;
    captured_at: z.ZodString;
    environment: z.ZodObject<{
        platform: z.ZodString;
        runtime_version: z.ZodString;
        package_version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        platform: string;
        runtime_version: string;
        package_version: string;
    }, {
        platform: string;
        runtime_version: string;
        package_version: string;
    }>;
}, "strip", z.ZodTypeAny, {
    status: {
        schema_version: "1.0";
        run_id: string | null;
        timestamp: string;
        state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
        last_transition: string;
        previous_state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded" | null;
        transition_count: number;
        uptime_ms: number;
        degradation?: {
            reason: string;
            affected_subsystems: string[];
            since: string;
        } | undefined;
        failure?: {
            message: string;
            recoverable: boolean;
            error_code: string;
        } | undefined;
    };
    schema_version: "1.0";
    output_hash: string;
    environment: {
        platform: string;
        runtime_version: string;
        package_version: string;
    };
    plan: Record<string, unknown>;
    receipt: {
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
    };
    execution_profile: {
        phases: {
            phase: string;
            duration_ms: number;
            start: string;
            end: string;
        }[];
        resources: {
            peak_memory_bytes: number;
            events_processed: number;
            algorithm_invocations: number;
        };
        total_duration_ms: number;
    };
    captured_at: string;
}, {
    status: {
        schema_version: "1.0";
        run_id: string | null;
        timestamp: string;
        state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
        last_transition: string;
        previous_state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded" | null;
        transition_count: number;
        uptime_ms: number;
        degradation?: {
            reason: string;
            affected_subsystems: string[];
            since: string;
        } | undefined;
        failure?: {
            message: string;
            recoverable: boolean;
            error_code: string;
        } | undefined;
    };
    schema_version: "1.0";
    output_hash: string;
    environment: {
        platform: string;
        runtime_version: string;
        package_version: string;
    };
    plan: Record<string, unknown>;
    receipt: {
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
    };
    execution_profile: {
        phases: {
            phase: string;
            duration_ms: number;
            start: string;
            end: string;
        }[];
        resources: {
            peak_memory_bytes: number;
            events_processed: number;
            algorithm_invocations: number;
        };
        total_duration_ms: number;
    };
    captured_at: string;
}>;
/**
 * Explain snapshot — identical structure to execution result,
 * capturing everything needed to reproduce or debug a run
 */
export type ExplainSnapshot = z.infer<typeof ExplainSnapshotSchema> & {
    plan: Plan;
};
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