/**
 * Status Schema - Lifecycle states for wasm4pm runtime
 * Schema version 1.0
 *
 * Defines all possible states in the runtime lifecycle with
 * deterministic serialization for hashing.
 */
import { z } from 'zod';
/**
 * All valid lifecycle states
 */
export type LifecycleState = 'uninitialized' | 'bootstrapping' | 'ready' | 'planning' | 'running' | 'watching' | 'degraded' | 'failed';
/**
 * Ordered lifecycle states for deterministic comparison
 */
export declare const LIFECYCLE_STATES: readonly LifecycleState[];
/**
 * Allowed state transitions (from → to[])
 */
export declare const STATE_TRANSITIONS: Record<LifecycleState, readonly LifecycleState[]>;
export declare const LifecycleStateSchema: z.ZodEnum<["uninitialized", "bootstrapping", "ready", "planning", "running", "watching", "degraded", "failed"]>;
export declare const StatusSchema: z.ZodObject<{
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
/**
 * Status snapshot — captures full runtime state at a point in time
 */
export type Status = z.infer<typeof StatusSchema>;
/**
 * Check if a state transition is valid
 */
export declare function isValidTransition(from: LifecycleState, to: LifecycleState): boolean;
/**
 * Check if a string is a valid lifecycle state
 */
export declare function isLifecycleState(value: string): value is LifecycleState;
/**
 * Type guard for Status objects
 */
export declare function isStatus(value: unknown): value is Status;
/**
 * JSON Schema for Status (for external validation)
 */
export declare const STATUS_JSON_SCHEMA: {
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
            readonly enum: readonly LifecycleState[];
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
                readonly enum: readonly LifecycleState[];
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
//# sourceMappingURL=status.d.ts.map