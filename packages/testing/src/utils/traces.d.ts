/**
 * Trace Utilities
 *
 * Utilities for working with event traces.
 * Provides trace equivalence checking, permutation validation, and completeness checks.
 */
export interface Trace {
  caseId: string;
  activities: string[];
  timestamps?: string[];
  attributes?: Record<string, unknown>;
}
export interface TraceComparison {
  equal: boolean;
  type: 'identical' | 'permutation' | 'different';
  differences: string[];
}
export interface TracePermutationResult {
  isPermutation: boolean;
  originalOrder: string[];
  newOrder: string[];
  permutations: Array<{
    i: number;
    j: number;
  }>;
}
/**
 * Compare two traces for equivalence.
 *
 * Checks for exact match, permutation (same activities in different order),
 * or different traces.
 */
export declare function compareTraces(
  trace1: Trace | string[],
  trace2: Trace | string[]
): TraceComparison;
/**
 * Check if two traces are identical (same activities in same order).
 */
export declare function areTracesIdentical(
  trace1: Trace | string[],
  trace2: Trace | string[]
): boolean;
/**
 * Check if one trace is a permutation of another (same activities, different order).
 */
export declare function areTracesPermutation(
  trace1: Trace | string[],
  trace2: Trace | string[]
): boolean;
/**
 * Check if a trace is a permutation of another and find the permutation sequence.
 */
export declare function findTracePermutation(
  original: string[],
  permuted: string[]
): TracePermutationResult;
/**
 * Generate all permutations of a trace (for testing).
 *
 * Warning: Use only with small traces (n <= 8) due to factorial growth.
 */
export declare function generateAllPermutations(activities: string[]): string[][];
/**
 * Check if a trace is complete (has start and end activities).
 */
export declare function isTraceComplete(
  trace: Trace,
  options?: {
    requireStart?: string;
    requireEnd?: string;
  }
): boolean;
/**
 * Validate trace timestamps are in chronological order.
 */
export declare function validateTraceTimestamps(trace: Trace): {
  valid: boolean;
  errors: string[];
};
/**
 * Check if trace contains duplicate consecutive activities.
 */
export declare function hasDuplicateConsecutiveActivities(trace: Trace): {
  hasDuplicates: boolean;
  positions: number[];
};
/**
 * Check if trace contains self-loops (activity appears twice with activities in between).
 */
export declare function hasSelfLoops(trace: Trace): {
  hasLoops: boolean;
  loops: Array<{
    activity: string;
    positions: number[];
  }>;
};
/**
 * Compute trace length statistics.
 */
export declare function computeTraceStatistics(traces: Trace[]): {
  count: number;
  minLength: number;
  maxLength: number;
  avgLength: number;
  lengthDistribution: Map<number, number>;
};
/**
 * Get unique activities from traces.
 */
export declare function getUniqueActivities(traces: Trace[]): string[];
/**
 * Compute activity frequency across all traces.
 */
export declare function computeActivityFrequency(traces: Trace[]): Map<string, number>;
/**
 * Find the most common trace variant.
 */
export declare function findMostCommonVariant(traces: Trace[]): {
  trace: string[];
  count: number;
} | null;
/**
 * Create a test trace.
 */
export declare function createTestTrace(activities: string[], caseId?: string): Trace;
/**
 * Create test traces for common process patterns.
 */
export declare function createTestTraces(): {
  sequential: Trace[];
  parallel: Trace[];
  choice: Trace[];
  loop: Trace[];
};
/**
 * Format trace as human-readable string.
 */
export declare function formatTrace(trace: Trace): string;
/**
 * Format trace comparison as human-readable string.
 */
export declare function formatTraceComparison(comparison: TraceComparison): string;
/**
 * Serialize trace to JSON string.
 */
export declare function serializeTrace(trace: Trace): string;
/**
 * Deserialize trace from JSON string.
 */
export declare function deserializeTrace(json: string): Trace;
/**
 * Convert trace to simple string array.
 */
export declare function traceToArray(trace: Trace): string[];
/**
 * Convert string array to trace.
 */
export declare function arrayToTrace(activities: string[], caseId?: string): Trace;
/**
 * Check if trace is a subsequence of another trace.
 */
export declare function isSubsequence(subsequence: string[], trace: string[]): boolean;
/**
 * Find the longest common subsequence of two traces.
 */
export declare function longestCommonSubsequence(trace1: string[], trace2: string[]): string[];
/**
 * Compute trace similarity based on LCS length.
 */
export declare function traceSimilarity(trace1: string[], trace2: string[]): number;
//# sourceMappingURL=traces.d.ts.map
