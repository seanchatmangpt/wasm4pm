/**
 * @pictl/contracts
 *
 * Shared type definitions and contracts for the wasm4pm ecosystem.
 * Provides interfaces for source connectors, sink adapters, compatibility matrices,
 * runtime receipts, execution plans, status lifecycle, and explain snapshots.
 *
 * All schemas are versioned and export both TypeScript types and JSON schemas.
 */
export * from './types.js';
export * from './templates/index.js';
export * from './errors.js';
export type { ErrorInfo as ErrorDetails, ErrorCode } from './errors.js';
export { createError, formatError, formatErrorJSON, logError, validateErrorSystem, createTypedError, resolveErrorCode, isTypedError, TYPED_ERROR_CODES, TYPED_ERROR_NAMES, TYPED_ERROR_JSON_SCHEMA, } from './errors.js';
export type { TypedError } from './errors.js';
export * from './result.js';
export * from './connectors.js';
export * from './sinks.js';
export * from './compatibility.js';
export type { Receipt, ErrorInfo, ExecutionSummary, AlgorithmInfo, ModelInfo, ExecutionProfile, } from './receipt.js';
export { isReceipt, RECEIPT_JSON_SCHEMA } from './receipt.js';
export { hashConfig, hashData, hashJsonString, verifyHash, normalizeForHashing, } from './hash.js';
export { ReceiptBuilder } from './receipt-builder.js';
export type { ValidationResult } from './validation.js';
export { validateReceipt, verifyReceiptHashes, detectTampering, } from './validation.js';
export type { Plan, PlanNode, PlanEdge, PlanNodeKind } from './plan.js';
export { isPlan, validatePlanDAG, normalizePlan, sortNodes, sortEdges, PLAN_JSON_SCHEMA, } from './plan.js';
export type { Status, LifecycleState } from './status.js';
export { isStatus, isLifecycleState, isValidTransition, LIFECYCLE_STATES, STATE_TRANSITIONS, STATUS_JSON_SCHEMA, } from './status.js';
export type { ExplainSnapshot, PhaseTiming, ResourceUsage, ExecutionProfile as ExplainExecutionProfile, } from './explain.js';
export { isExplainSnapshot, EXPLAIN_JSON_SCHEMA } from './explain.js';
export { PLAN_STEP_TYPE_VALUES } from './steps.js';
export type { PlanStepTypeValue } from './steps.js';
export declare const ALL_JSON_SCHEMAS: {
    readonly typedError: {
        readonly $schema: "https://json-schema.org/draft/2020-12/schema";
        readonly $id: "https://wasm4pm.dev/schemas/typed-error/1.0";
        readonly title: "TypedError";
        readonly description: "Compact typed error with numeric code (0-255)";
        readonly type: "object";
        readonly required: readonly ["schema_version", "code", "message", "remediation", "context"];
        readonly properties: {
            readonly schema_version: {
                readonly type: "string";
                readonly const: "1.0";
            };
            readonly code: {
                readonly type: "integer";
                readonly minimum: 0;
                readonly maximum: 255;
            };
            readonly message: {
                readonly type: "string";
            };
            readonly remediation: {
                readonly type: "string";
            };
            readonly context: {
                readonly type: "object";
            };
        };
        readonly additionalProperties: false;
    };
    readonly receipt: {
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
    readonly plan: {
        readonly $schema: "https://json-schema.org/draft/2020-12/schema";
        readonly $id: "https://wasm4pm.dev/schemas/plan/1.0";
        readonly title: "Plan";
        readonly description: "Execution plan DAG";
        readonly type: "object";
        readonly required: readonly ["schema_version", "plan_id", "created_at", "nodes", "edges", "metadata"];
        readonly properties: {
            readonly schema_version: {
                readonly type: "string";
                readonly const: "1.0";
            };
            readonly plan_id: {
                readonly type: "string";
            };
            readonly created_at: {
                readonly type: "string";
                readonly format: "date-time";
            };
            readonly nodes: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly required: readonly ["id", "kind", "label", "config", "version"];
                    readonly properties: {
                        readonly id: {
                            readonly type: "string";
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly enum: readonly ["source", "algorithm", "sink"];
                        };
                        readonly label: {
                            readonly type: "string";
                        };
                        readonly config: {
                            readonly type: "object";
                        };
                        readonly version: {
                            readonly type: "string";
                        };
                    };
                    readonly additionalProperties: false;
                };
            };
            readonly edges: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly required: readonly ["from", "to"];
                    readonly properties: {
                        readonly from: {
                            readonly type: "string";
                        };
                        readonly to: {
                            readonly type: "string";
                        };
                        readonly label: {
                            readonly type: "string";
                        };
                    };
                    readonly additionalProperties: false;
                };
            };
            readonly metadata: {
                readonly type: "object";
                readonly required: readonly ["planner", "planner_version"];
                readonly properties: {
                    readonly planner: {
                        readonly type: "string";
                    };
                    readonly planner_version: {
                        readonly type: "string";
                    };
                    readonly estimated_duration_ms: {
                        readonly type: "number";
                        readonly minimum: 0;
                    };
                };
                readonly additionalProperties: false;
            };
        };
        readonly additionalProperties: false;
    };
    readonly status: {
        readonly $schema: "https://json-schema.org/draft/2020-12/schema";
        readonly $id: "https://wasm4pm.dev/schemas/status/1.0";
        readonly title: "Status";
        readonly description: "Runtime lifecycle status snapshot";
        readonly type: "object";
        readonly required: readonly ["schema_version", "state", "timestamp", "last_transition", "previous_state", "transition_count", "run_id", "uptime_ms"];
        readonly properties: {
            readonly schema_version: {
                readonly type: "string";
                readonly const: "1.0";
            };
            readonly state: {
                readonly type: "string";
                readonly enum: readonly import("./status.js").LifecycleState[];
            };
            readonly timestamp: {
                readonly type: "string";
                readonly format: "date-time";
            };
            readonly last_transition: {
                readonly type: "string";
                readonly format: "date-time";
            };
            readonly previous_state: {
                readonly oneOf: readonly [{
                    readonly type: "string";
                    readonly enum: readonly import("./status.js").LifecycleState[];
                }, {
                    readonly type: "null";
                }];
            };
            readonly transition_count: {
                readonly type: "integer";
                readonly minimum: 0;
            };
            readonly run_id: {
                readonly oneOf: readonly [{
                    readonly type: "string";
                    readonly format: "uuid";
                }, {
                    readonly type: "null";
                }];
            };
            readonly degradation: {
                readonly type: "object";
                readonly properties: {
                    readonly reason: {
                        readonly type: "string";
                    };
                    readonly affected_subsystems: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly since: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                };
                readonly required: readonly ["reason", "affected_subsystems", "since"];
            };
            readonly failure: {
                readonly type: "object";
                readonly properties: {
                    readonly error_code: {
                        readonly type: "string";
                    };
                    readonly message: {
                        readonly type: "string";
                    };
                    readonly recoverable: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["error_code", "message", "recoverable"];
            };
            readonly uptime_ms: {
                readonly type: "number";
                readonly minimum: 0;
            };
        };
        readonly additionalProperties: false;
    };
    readonly explain: {
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
};
//# sourceMappingURL=index.d.ts.map