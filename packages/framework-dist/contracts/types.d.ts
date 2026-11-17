/**
 * Shared type definitions for wasm4pm
 */
import { z } from 'zod';
/**
 * Quality metrics for process model assessment.
 * Used by conformance checking and quality commands.
 */
export declare const QualityMetricsSchema: z.ZodObject<{
    /** How well the model can replay the observed log (0-1) */
    fitness: z.ZodNumber;
    /** How much unobserved behavior the model allows (0-1) */
    precision: z.ZodNumber;
    /** How simple/complex the model is (0-1) */
    simplicity: z.ZodNumber;
    /** How well the model generalizes to unseen behavior (0-1) */
    generalization: z.ZodOptional<z.ZodNumber>;
    /** Harmonic mean of fitness and precision (0-1) */
    f_measure: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    fitness: number;
    precision: number;
    simplicity: number;
    generalization?: number | undefined;
    f_measure?: number | undefined;
}, {
    fitness: number;
    precision: number;
    simplicity: number;
    generalization?: number | undefined;
    f_measure?: number | undefined;
}>;
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;
/**
 * Individual step in an execution plan
 */
export declare const PlanStepSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    outputs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    optional: z.ZodOptional<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    description?: string | undefined;
    inputs?: Record<string, unknown> | undefined;
    outputs?: string[] | undefined;
    dependencies?: string[] | undefined;
    optional?: boolean | undefined;
    timeout?: number | undefined;
}, {
    id: string;
    name: string;
    description?: string | undefined;
    inputs?: Record<string, unknown> | undefined;
    outputs?: string[] | undefined;
    dependencies?: string[] | undefined;
    optional?: boolean | undefined;
    timeout?: number | undefined;
}>;
export type PlanStep = z.infer<typeof PlanStepSchema>;
/**
 * Execution plan returned by the planner
 * Contains ordered list of steps to execute with dependencies and parameters
 */
export declare const ExecutionPlanSchema: z.ZodObject<{
    planId: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        inputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        outputs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        optional: z.ZodOptional<z.ZodBoolean>;
        timeout: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        description?: string | undefined;
        inputs?: Record<string, unknown> | undefined;
        outputs?: string[] | undefined;
        dependencies?: string[] | undefined;
        optional?: boolean | undefined;
        timeout?: number | undefined;
    }, {
        id: string;
        name: string;
        description?: string | undefined;
        inputs?: Record<string, unknown> | undefined;
        outputs?: string[] | undefined;
        dependencies?: string[] | undefined;
        optional?: boolean | undefined;
        timeout?: number | undefined;
    }>, "many">;
    totalSteps: z.ZodNumber;
    estimatedDurationMs: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    prediction: z.ZodOptional<z.ZodObject<{
        tasks: z.ZodArray<z.ZodString, "many">;
        activityKey: z.ZodString;
        ngramOrder: z.ZodNumber;
        driftWindowSize: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        tasks: string[];
        activityKey: string;
        ngramOrder: number;
        driftWindowSize?: number | undefined;
    }, {
        tasks: string[];
        activityKey: string;
        ngramOrder: number;
        driftWindowSize?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    steps: {
        id: string;
        name: string;
        description?: string | undefined;
        inputs?: Record<string, unknown> | undefined;
        outputs?: string[] | undefined;
        dependencies?: string[] | undefined;
        optional?: boolean | undefined;
        timeout?: number | undefined;
    }[];
    planId: string;
    totalSteps: number;
    prediction?: {
        tasks: string[];
        activityKey: string;
        ngramOrder: number;
        driftWindowSize?: number | undefined;
    } | undefined;
    metadata?: Record<string, unknown> | undefined;
    estimatedDurationMs?: number | undefined;
}, {
    steps: {
        id: string;
        name: string;
        description?: string | undefined;
        inputs?: Record<string, unknown> | undefined;
        outputs?: string[] | undefined;
        dependencies?: string[] | undefined;
        optional?: boolean | undefined;
        timeout?: number | undefined;
    }[];
    planId: string;
    totalSteps: number;
    prediction?: {
        tasks: string[];
        activityKey: string;
        ngramOrder: number;
        driftWindowSize?: number | undefined;
    } | undefined;
    metadata?: Record<string, unknown> | undefined;
    estimatedDurationMs?: number | undefined;
}>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
/**
 * Engine state enum
 */
export type EngineState = 'uninitialized' | 'bootstrapping' | 'ready' | 'planning' | 'running' | 'watching' | 'degraded' | 'failed';
export declare const EngineStateSchema: z.ZodEnum<["uninitialized", "bootstrapping", "ready", "planning", "running", "watching", "degraded", "failed"]>;
/**
 * Structured error information
 */
export declare const EngineErrorSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    severity: z.ZodEnum<["info", "warning", "error", "fatal"]>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    recoverable: z.ZodBoolean;
    suggestion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    recoverable: boolean;
    severity: "error" | "info" | "warning" | "fatal";
    context?: Record<string, unknown> | undefined;
    suggestion?: string | undefined;
}, {
    code: string;
    message: string;
    recoverable: boolean;
    severity: "error" | "info" | "warning" | "fatal";
    context?: Record<string, unknown> | undefined;
    suggestion?: string | undefined;
}>;
export type EngineError = z.infer<typeof EngineErrorSchema>;
/**
 * Status update during execution
 */
export declare const StatusUpdateSchema: z.ZodObject<{
    timestamp: z.ZodDate;
    state: z.ZodEnum<["uninitialized", "bootstrapping", "ready", "planning", "running", "watching", "degraded", "failed"]>;
    progress: z.ZodNumber;
    message: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        severity: z.ZodEnum<["info", "warning", "error", "fatal"]>;
        context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        recoverable: z.ZodBoolean;
        suggestion: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }, {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    timestamp: Date;
    state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
    progress: number;
    message?: string | undefined;
    error?: {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    } | undefined;
}, {
    timestamp: Date;
    state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
    progress: number;
    message?: string | undefined;
    error?: {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    } | undefined;
}>;
export type StatusUpdate = z.infer<typeof StatusUpdateSchema>;
/**
 * Complete engine status snapshot
 */
export declare const EngineStatusSchema: z.ZodObject<{
    state: z.ZodEnum<["uninitialized", "bootstrapping", "ready", "planning", "running", "watching", "degraded", "failed"]>;
    runId: z.ZodOptional<z.ZodString>;
    progress: z.ZodNumber;
    estimate: z.ZodOptional<z.ZodObject<{
        elapsed: z.ZodNumber;
        remaining: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        elapsed: number;
        remaining: number;
    }, {
        elapsed: number;
        remaining: number;
    }>>;
    errors: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        severity: z.ZodEnum<["info", "warning", "error", "fatal"]>;
        context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        recoverable: z.ZodBoolean;
        suggestion: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }, {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }>, "many">;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
    progress: number;
    errors: {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }[];
    metadata?: Record<string, unknown> | undefined;
    runId?: string | undefined;
    estimate?: {
        elapsed: number;
        remaining: number;
    } | undefined;
}, {
    state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
    progress: number;
    errors: {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }[];
    metadata?: Record<string, unknown> | undefined;
    runId?: string | undefined;
    estimate?: {
        elapsed: number;
        remaining: number;
    } | undefined;
}>;
export type EngineStatus = z.infer<typeof EngineStatusSchema>;
/**
 * Execution receipt containing metadata about a completed run
 */
export declare const ExecutionReceiptSchema: z.ZodObject<{
    runId: z.ZodString;
    planId: z.ZodString;
    state: z.ZodEnum<["uninitialized", "bootstrapping", "ready", "planning", "running", "watching", "degraded", "failed"]>;
    startedAt: z.ZodDate;
    finishedAt: z.ZodOptional<z.ZodDate>;
    durationMs: z.ZodOptional<z.ZodNumber>;
    progress: z.ZodNumber;
    errors: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        severity: z.ZodEnum<["info", "warning", "error", "fatal"]>;
        context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        recoverable: z.ZodBoolean;
        suggestion: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }, {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }>, "many">;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    predictionResults: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
    planId: string;
    progress: number;
    runId: string;
    errors: {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }[];
    startedAt: Date;
    metadata?: Record<string, unknown> | undefined;
    finishedAt?: Date | undefined;
    durationMs?: number | undefined;
    predictionResults?: Record<string, unknown> | undefined;
}, {
    state: "failed" | "uninitialized" | "bootstrapping" | "ready" | "planning" | "running" | "watching" | "degraded";
    planId: string;
    progress: number;
    runId: string;
    errors: {
        code: string;
        message: string;
        recoverable: boolean;
        severity: "error" | "info" | "warning" | "fatal";
        context?: Record<string, unknown> | undefined;
        suggestion?: string | undefined;
    }[];
    startedAt: Date;
    metadata?: Record<string, unknown> | undefined;
    finishedAt?: Date | undefined;
    durationMs?: number | undefined;
    predictionResults?: Record<string, unknown> | undefined;
}>;
export type ExecutionReceipt = z.infer<typeof ExecutionReceiptSchema>;
//# sourceMappingURL=types.d.ts.map