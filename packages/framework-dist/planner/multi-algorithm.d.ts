/**
 * multi-algorithm.ts
 * Multi-algorithm planning for @wasm4pm/planner.
 *
 * planMultiAlgorithm(config, candidates) generates one ExecutionPlan per
 * candidate algorithm and returns a MultiAlgorithmPlan that surfaces:
 * - All individual plans (indexed by algorithm ID)
 * - A ranked selection recommendation with selection criteria
 * - Per-algorithm quality and speed tradeoff metadata
 *
 * Oracle: Rank-2 domain contract — selection criteria derive from Van der
 * Aalst quality/speed taxonomy embedded in the kernel registry.
 */
import type { Config, ExecutionPlan } from './planner.js';
/**
 * A single algorithm entry inside a MultiAlgorithmPlan.
 */
export interface AlgorithmPlanEntry {
    /** Algorithm identifier */
    algorithm: string;
    /** The full ExecutionPlan for this algorithm */
    plan: ExecutionPlan;
    /** Estimated wall-clock duration for this plan in ms */
    estimated_duration_ms: number;
    /** Estimated peak memory for this plan in MB */
    estimated_memory_mb: number;
    /** Quality prediction fitness estimate [0, 1] */
    fitness_estimate: number;
    /** Confidence of the fitness estimate */
    confidence: 'high' | 'medium' | 'low';
}
/**
 * The result of planMultiAlgorithm().
 * Contains one plan per candidate algorithm plus a ranked selection.
 */
export interface MultiAlgorithmPlan {
    /** Plans indexed by algorithm ID, in the order of the `candidates` input */
    plans: AlgorithmPlanEntry[];
    /**
     * Recommended algorithm from the set based on balanced speed/quality criteria.
     * Uses the profile's quality floor to determine the tradeoff.
     */
    recommended: string;
    /**
     * Human-readable explanation of why the recommended algorithm was selected.
     */
    selection_criteria: string;
    /**
     * Algorithms ranked from best to worst based on the profile's priority
     * (fast profile: speed first; quality profile: quality first; balanced: composite score).
     */
    ranked: string[];
}
/**
 * Generate execution plans for multiple candidate algorithms and return a
 * ranked MultiAlgorithmPlan.
 *
 * Each candidate algorithm is applied as an algorithm override (config.algorithm.name)
 * on top of the provided base config. The profile, source, sink, and all other
 * settings are inherited from the base config.
 *
 * @param baseConfig  Base configuration (profile, source, etc.)
 * @param candidates  List of algorithm IDs to plan for
 * @returns           MultiAlgorithmPlan with all plans + ranked recommendation
 * @throws            PlannerError if any individual plan fails to generate
 */
export declare function planMultiAlgorithm(baseConfig: Config, candidates: string[]): MultiAlgorithmPlan;
//# sourceMappingURL=multi-algorithm.d.ts.map