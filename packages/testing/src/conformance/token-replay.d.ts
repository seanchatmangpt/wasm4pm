/**
 * Token-Replay Conformance Testing
 *
 * Utilities for testing conformance checking using token replay.
 * Provides test helpers for validating conformance results.
 */
export interface TokenReplayConfig {
    initialMarking?: string[];
    finalMarking?: string[];
    maxTokens?: number;
    skipMissingActivities?: boolean;
}
export interface TokenReplayTrace {
    caseId: string;
    activities: string[];
    success: boolean;
    missingTokens: number;
    remainingTokens: number;
    consumedTokens: number;
    producedTokens: number;
    deviations: ConformanceDeviation[];
}
export interface ConformanceDeviation {
    position: number;
    activity: string;
    type: 'missing' | 'remaining' | 'skip';
    message: string;
}
export interface TokenReplayResult {
    overallFitness: number;
    traceResults: TokenReplayTrace[];
    totalMissingTokens: number;
    totalRemainingTokens: number;
    totalConsumedTokens: number;
    totalProducedTokens: number;
    alignedTraces: number;
    totalTraces: number;
}
export interface PetriNetForReplay {
    places: Array<{
        id: string;
        label?: string;
    }>;
    transitions: Array<{
        id: string;
        label?: string;
    }>;
    arcs: Array<{
        id: string;
        source: string;
        target: string;
        weight?: number;
    }>;
}
/**
 * Perform token replay conformance checking.
 *
 * Simulates executing a Petri net with event log traces to measure conformance.
 */
export declare function tokenReplayConformance(net: PetriNetForReplay, eventLog: Array<{
    caseId: string;
    activities: string[];
}>, config?: TokenReplayConfig): TokenReplayResult;
/**
 * Create a test Petri net for conformance testing.
 *
 * Creates a simple A -> B -> C process model.
 */
export declare function createTestPetriNet(): PetriNetForReplay;
/**
 * Create a test event log for conformance testing.
 *
 * Returns both fitting and non-fitting traces.
 */
export declare function createTestEventLog(): Array<{
    caseId: string;
    activities: string[];
}>;
/**
 * Expected token replay result for test data.
 *
 * Use this to validate your token replay implementation.
 */
export declare function getExpectedTestResult(): Partial<TokenReplayResult>;
/**
 * Helper to compare floating point numbers.
 */
export declare function expectCloseTo(value: number, delta?: number): number;
/**
 * Assert that a token replay result matches expected values.
 */
export declare function assertTokenReplayResult(actual: TokenReplayResult, expected: Partial<TokenReplayResult>): {
    pass: boolean;
    message: string;
};
export interface Alignment {
    trace: string[];
    aligned: Array<{
        model?: string;
        log?: string;
        cost: number;
    }>;
    cost: number;
    optimal: boolean;
}
export interface AlignmentConfig {
    costModel?: {
        moveOnLog?: number;
        moveOnModel?: number;
        synchronousMove?: number;
    };
    maxStates?: number;
    timeout?: number;
}
/**
 * Compute alignment between a trace and a Petri net.
 *
 * This is a simplified version - full implementation requires A* search.
 */
export declare function computeAlignment(net: PetriNetForReplay, trace: string[], config?: AlignmentConfig): Alignment;
/**
 * Format token replay result as human-readable string.
 */
export declare function formatTokenReplayResult(result: TokenReplayResult): string;
/**
 * Format alignment as human-readable string.
 */
export declare function formatAlignment(alignment: Alignment): string;
//# sourceMappingURL=token-replay.d.ts.map