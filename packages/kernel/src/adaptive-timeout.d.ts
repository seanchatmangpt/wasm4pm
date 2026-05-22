/**
 * adaptive-timeout.ts
 *
 * Computes runtime-adaptive timeout values based on log complexity and algorithm characteristics.
 *
 * Design: Timeout is a function of three dimensions:
 *   1. Event count (log size) — scales linearly with events
 *   2. Complexity indicator (simple vs complex log structure)
 *   3. Algorithm type (fast: dfg/skeleton vs quality: genetic/ilp)
 *
 * Formula:
 *   timeout_ms = base
 *              + (eventCount / 10_000) * event_factor_ms
 *              + complexity_multiplier * base
 *              + algorithm_multiplier * base
 *
 * Bounds: [5000, 300000] (5–300 seconds)
 *
 * Oracle: Rank 2 (Domain contract) — timeout formula must align with Cycle 54
 * baseline measurements.
 */
export interface TimeoutFactors {
    /** Measured event count from the log */
    eventCount: number;
    /** Simple (1.0) or complex (2.0) log structure estimate */
    complexity: 'simple' | 'complex';
    /** Algorithm tier: 'fast', 'balanced', or 'quality' */
    algorithmTier: 'fast' | 'balanced' | 'quality';
    /** Specific algorithm name (used for overrides) */
    algorithmName?: string;
}
export interface TimeoutResult {
    /** Computed timeout in milliseconds */
    timeoutMs: number;
    /** Breakdown of timeout computation (for debugging/observability) */
    breakdown: {
        base_ms: number;
        event_factor_ms: number;
        complexity_multiplier: number;
        algorithm_multiplier: number;
    };
}
/**
 * Compute an adaptive timeout value based on log complexity and algorithm characteristics.
 *
 * @param factors Input dimensions for timeout calculation
 * @returns Computed timeout in milliseconds and breakdown for observability
 *
 * Example:
 * ```ts
 * const result = computeTimeout({
 *   eventCount: 100_000,
 *   complexity: 'complex',
 *   algorithmTier: 'quality',
 *   algorithmName: 'genetic_algorithm'
 * });
 * console.log(`Timeout: ${result.timeoutMs}ms`); // ~180000 (3 minutes)
 * console.log(result.breakdown); // { base_ms, event_factor_ms, ... }
 * ```
 */
export declare function computeTimeout(factors: TimeoutFactors): TimeoutResult;
/**
 * Classify event log complexity based on simple heuristics.
 *
 * Simple logs: Few distinct activities, low trace variance
 * Complex logs: Many activities, high trace variance, many variants
 *
 * @param eventCount Total events in the log
 * @param distinctActivities Number of unique activity names
 * @param numTraces Number of distinct traces (cases)
 * @returns 'simple' or 'complex'
 *
 * Heuristic thresholds:
 *   - Distinct activities > 150 → complex
 *   - Variance ratio (traces / activities) > 10 → complex
 *   - Event density (events / traces) > 100 → complex
 */
export declare function classifyComplexity(eventCount: number, distinctActivities: number, numTraces: number): 'simple' | 'complex';
/**
 * Detect algorithm tier from algorithm name using regex patterns.
 *
 * @param algorithmName The algorithm ID (e.g., 'genetic_algorithm', 'dfg', 'ilp')
 * @returns 'fast', 'balanced', or 'quality'
 */
export declare function detectAlgorithmTier(algorithmName: string): 'fast' | 'balanced' | 'quality';
//# sourceMappingURL=adaptive-timeout.d.ts.map