/**
 * Execution plan generator for wasm4pm process mining engine
 * Generates deterministic, reproducible execution plans from configuration
 *
 * Per PRD §11: explain() == run()
 * The plan is used by both explain() and run() - only difference is explanation vs execution
 */
import type { ErrorInfo, BudgetEnvelope } from '@pictl/contracts';
import type { DAG } from './dag.js';
import type { PlanStep } from './steps.js';
/**
 * Typed error for planner failures.
 * Extends Error for compatibility with try/catch while carrying ErrorInfo.
 */
export declare class PlannerError extends Error {
    readonly info: ErrorInfo;
    constructor(info: ErrorInfo);
}
/**
 * Configuration for plan generation
 * Mirrors the wasm4pm config structure
 */
export interface Config {
    version: '1.0';
    source: {
        format: string;
        content?: string;
    };
    execution: {
        profile: string;
        mode?: string;
        maxEvents?: number;
        maxMemoryMB?: number;
        timeoutMs?: number;
        enableProfiling?: boolean;
        parameters?: Record<string, unknown>;
    };
    algorithm?: {
        /** Override the profile's default discovery algorithm with a specific registry ID */
        name?: string;
        parameters?: Record<string, unknown>;
    };
    output?: {
        generateReports?: boolean;
        includeMetrics?: boolean;
        includeRawResults?: boolean;
        format?: string;
        onProgress?: (progress: unknown) => void;
    };
    pipeline?: Array<{
        id: string;
        type: string;
        required?: boolean;
        parameters?: Record<string, unknown>;
        dependsOn?: string[];
        parallelizable?: boolean;
    }>;
    ml?: {
        enabled?: boolean;
        tasks?: string[];
        method?: string;
        k?: number;
        targetKey?: string;
        forecastPeriods?: number;
        nComponents?: number;
        eps?: number;
    };
    metadata?: {
        name?: string;
        description?: string;
        tags?: string[];
    };
}
/**
 * Execution plan with deterministic layout and reproducible hash
 * Section 4 of the Three-Layer Architecture Specification requires BudgetEnvelope
 * to be attached to every ExecutionPlan for budget-first dispatch.
 */
export interface ExecutionPlan {
    /** Unique plan identifier (UUID) */
    id: string;
    /** BLAKE3 hash of normalized plan structure */
    hash: string;
    /** Original configuration used to generate this plan */
    config: Config;
    /** Ordered list of execution steps */
    steps: PlanStep[];
    /** Directed acyclic graph of step dependencies */
    graph: DAG;
    /** Kind of source data (e.g., 'xes', 'csv') */
    sourceKind: string;
    /** Kind of sink output (e.g., 'json', 'parquet') */
    sinkKind: string;
    /** Execution profile used (e.g., 'fast', 'balanced', 'quality') */
    profile: string;
    /** Budget envelope defining execution constraints (Section 4.1)
     * Attached by plan() and used by backend selection algorithm (Section 3.5).
     * Immutable; governs latency, memory, quality, and execution mode.
     */
    budget: BudgetEnvelope;
}
/**
 * Generates an execution plan from a configuration
 *
 * Plan structure:
 * 1. Bootstrap -> init_wasm -> load_source -> validate_source
 * 2. Parallel discovery and analysis steps (with validate_source as dependency)
 * 3. Optional: generate_reports (depends on all prior steps)
 * 4. Optional: write_sink (depends on reports or prior steps)
 * 5. Optional: cleanup (depends on everything)
 *
 * @param config - Configuration specifying source, profile, and options
 * @returns ExecutionPlan with deterministic structure and BLAKE3 hash, BudgetEnvelope attached
 * @throws Error if configuration is invalid
 */
export declare function plan(config: Config): ExecutionPlan;
/**
 * Converts an ExecutionPlan to the contracts Plan schema.
 * Maps internal steps to PlanNode kinds (source/algorithm/sink).
 */
export declare function toContractsPlan(executionPlan: ExecutionPlan): {
    schema_version: '1.0';
    plan_id: string;
    created_at: string;
    nodes: Array<{
        id: string;
        kind: 'source' | 'algorithm' | 'sink';
        label: string;
        config: Record<string, unknown>;
        version: string;
    }>;
    edges: Array<{
        from: string;
        to: string;
        label?: string;
    }>;
    metadata: {
        planner: string;
        planner_version: string;
        estimated_duration_ms?: number;
    };
};
/**
 * Default export for plan function
 */
export default plan;
//# sourceMappingURL=planner.d.ts.map