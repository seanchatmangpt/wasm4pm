/**
 * Execution plan explanation in human-readable markdown format
 *
 * Per PRD §11: explain() == run()
 * The explanation is generated from the same plan used for execution
 */
import type { Config, ExecutionPlan } from './planner.js';
interface AlgorithmHints {
    speedTier: number;
    qualityTier: number;
    complexity: string;
    scalesWell: boolean;
    robustToNoise: boolean;
    /**
     * Actual output type — overrides ALGORITHM_OUTPUT_TYPES from contracts where
     * the contracts registry has a stale value. The kernel registry (registry.ts)
     * is the authoritative source for output types; the contracts registry may lag
     * after Phase 4 audits corrected several algorithms from 'petrinet' to 'dfg'.
     */
    outputType: string;
}
export type { AlgorithmHints };
/** Subset of kernel registry metadata needed by explain() */
export declare const ALGORITHM_HINTS: Record<string, AlgorithmHints>;
/**
 * Generates a human-readable markdown explanation of an execution plan
 *
 * The explanation includes:
 * - Plan metadata (ID, hash, profile)
 * - Configuration summary
 * - Execution steps in order
 * - Dependency graph visualization
 * - Resource estimates
 *
 * @param config - Configuration to explain
 * @returns Markdown string describing the plan
 */
export declare function explain(config: Config): string;
/**
 * Generates a summary explanation (shorter version)
 * Useful for logging or quick reference
 *
 * @param config - Configuration to summarize
 * @returns Short markdown summary
 */
export declare function explainBrief(config: Config): string;
/**
 * Structured result returned by explainStructured().
 * Carries all explain() content in machine-readable form.
 */
export interface ExplainResult {
    /** One-line human-readable summary of the plan */
    summary: string;
    /** Details about the chosen algorithm */
    algorithm_choice: {
        name: string;
        reason: string;
        speed_tier: string;
        quality_tier: string;
    };
    /** Details about the chosen execution profile */
    profile_choice: {
        name: string;
        description: string;
    };
    /** Estimated wall-clock runtime as a human-readable string, e.g. "~1.3 seconds" */
    estimated_runtime: string;
    /**
     * Academic context: van der Aalst reference or foundational paper for the algorithm.
     * Returns empty string if no reference is known.
     */
    academic_context: string;
    /** The full ExecutionPlan that backs this explanation */
    plan: ExecutionPlan;
    /** Non-fatal advisory warnings from the plan (e.g. large log, memory constraints) */
    warnings: string[];
}
/**
 * Generate a structured, machine-readable explanation of the execution plan.
 *
 * Returns an ExplainResult with all fields populated from the plan and
 * algorithm metadata. Useful for programmatic inspection, logging, and
 * driving CLI human-output formatters.
 *
 * @param config - Configuration to explain
 * @returns ExplainResult with all required fields
 */
export declare function explainStructured(config: Config): ExplainResult;
/**
 * Export functions
 */
export default explain;
//# sourceMappingURL=explain.d.ts.map