/**
 * Trace Utilities
 *
 * Utilities for working with event traces.
 * Provides trace equivalence checking, permutation validation, and completeness checks.
 */

// ─── Types ────────────────────────────────────────────────────────────────

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
  permutations: Array<{ i: number; j: number }>;
}

// ─── Trace Comparison ──────────────────────────────────────────────────────

/**
 * Compare two traces for equivalence.
 *
 * Checks for exact match, permutation (same activities in different order),
 * or different traces.
 */
export function compareTraces(trace1: Trace | string[], trace2: Trace | string[]): TraceComparison {
  const activities1 = Array.isArray(trace1) ? trace1 : trace1.activities;
  const activities2 = Array.isArray(trace2) ? trace2 : trace2.activities;

  const differences: string[] = [];

  // Check exact match
  if (activities1.length === activities2.length) {
    let exactMatch = true;
    for (let i = 0; i < activities1.length; i++) {
      if (activities1[i] !== activities2[i]) {
        exactMatch = false;
        differences.push(`Position ${i}: "${activities1[i]}" vs "${activities2[i]}"`);
      }
    }

    if (exactMatch) {
      return { equal: true, type: 'identical', differences: [] };
    }
  }

  // Check if one is a permutation of the other
  if (activities1.length === activities2.length) {
    const counts1 = new Map<string, number>();
    const counts2 = new Map<string, number>();

    for (const a of activities1) {
      counts1.set(a, (counts1.get(a) || 0) + 1);
    }
    for (const a of activities2) {
      counts2.set(a, (counts2.get(a) || 0) + 1);
    }

    let permutationMatch = true;
    for (const [activity, count] of counts1) {
      if (counts2.get(activity) !== count) {
        permutationMatch = false;
        differences.push(`Activity count mismatch: "${activity}" (${count} vs ${counts2.get(activity) || 0})`);
      }
    }

    for (const [activity, count] of counts2) {
      if (!counts1.has(activity)) {
        permutationMatch = false;
        differences.push(`Activity only in trace 2: "${activity}" (${count} times)`);
      }
    }

    if (permutationMatch) {
      return { equal: true, type: 'permutation', differences: [] };
    }
  }

  // Different traces
  if (activities1.length !== activities2.length) {
    differences.push(`Length mismatch: ${activities1.length} vs ${activities2.length}`);
  }

  return { equal: false, type: 'different', differences };
}

/**
 * Check if two traces are identical (same activities in same order).
 */
export function areTracesIdentical(trace1: Trace | string[], trace2: Trace | string[]): boolean {
  const comparison = compareTraces(trace1, trace2);
  return comparison.equal && comparison.type === 'identical';
}

/**
 * Check if one trace is a permutation of another (same activities, different order).
 */
export function areTracesPermutation(trace1: Trace | string[], trace2: Trace | string[]): boolean {
  const comparison = compareTraces(trace1, trace2);
  return comparison.equal && comparison.type === 'permutation';
}

// ─── Trace Permutation ─────────────────────────────────────────────────────

/**
 * Check if a trace is a permutation of another and find the permutation sequence.
 */
export function findTracePermutation(
  original: string[],
  permuted: string[],
): TracePermutationResult {
  if (original.length !== permuted.length) {
    return {
      isPermutation: false,
      originalOrder: original,
      newOrder: permuted,
      permutations: [],
    };
  }

  // Count occurrences
  const counts = new Map<string, number>();
  for (const activity of original) {
    counts.set(activity, (counts.get(activity) || 0) + 1);
  }

  for (const activity of permuted) {
    const count = counts.get(activity);
    if (count === undefined || count === 0) {
      return {
        isPermutation: false,
        originalOrder: original,
        newOrder: permuted,
        permutations: [],
      };
    }
    counts.set(activity, count - 1);
  }

  // Find permutation sequence
  const permutations: Array<{ i: number; j: number }> = [];
  const working = [...permuted];

  for (let i = 0; i < original.length; i++) {
    if (working[i] === original[i]) continue;

    // Find where the correct element is
    for (let j = i + 1; j < working.length; j++) {
      if (working[j] === original[i]) {
        // Swap elements i and j
        const temp = working[i];
        working[i] = working[j];
        working[j] = temp;
        permutations.push({ i, j });
        break;
      }
    }
  }

  return {
    isPermutation: true,
    originalOrder: original,
    newOrder: working,
    permutations,
  };
}

/**
 * Generate all permutations of a trace (for testing).
 *
 * Warning: Use only with small traces (n <= 8) due to factorial growth.
 */
export function generateAllPermutations(activities: string[]): string[][] {
  if (activities.length <= 1) {
    return [activities];
  }

  const result: string[][] = [];

  function permute(arr: string[], start: number) {
    if (start === arr.length) {
      result.push([...arr]);
      return;
    }

    for (let i = start; i < arr.length; i++) {
      // Swap elements
      [arr[start], arr[i]] = [arr[i], arr[start]];

      // Recurse
      permute(arr, start + 1);

      // Swap back
      [arr[start], arr[i]] = [arr[i], arr[start]];
    }
  }

  permute([...activities], 0);
  return result;
}

// ─── Trace Validation ──────────────────────────────────────────────────────

/**
 * Check if a trace is complete (has start and end activities).
 */
export function isTraceComplete(trace: Trace, options: { requireStart?: string; requireEnd?: string } = {}): boolean {
  const { requireStart, requireEnd } = options;

  if (trace.activities.length === 0) {
    return false;
  }

  if (requireStart && trace.activities[0] !== requireStart) {
    return false;
  }

  if (requireEnd && trace.activities[trace.activities.length - 1] !== requireEnd) {
    return false;
  }

  return true;
}

/**
 * Validate trace timestamps are in chronological order.
 */
export function validateTraceTimestamps(trace: Trace): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!trace.timestamps || trace.timestamps.length === 0) {
    return { valid: true, errors: [] }; // No timestamps to validate
  }

  if (trace.timestamps.length !== trace.activities.length) {
    errors.push(`Timestamp count (${trace.timestamps.length}) doesn't match activity count (${trace.activities.length})`);
    return { valid: false, errors };
  }

  for (let i = 1; i < trace.timestamps.length; i++) {
    const prevTime = new Date(trace.timestamps[i - 1]).getTime();
    const currTime = new Date(trace.timestamps[i]).getTime();

    if (isNaN(prevTime) || isNaN(currTime)) {
      errors.push(`Invalid timestamp at position ${i}`);
      continue;
    }

    if (currTime < prevTime) {
      errors.push(`Timestamp out of order at position ${i}: ${trace.timestamps[i]} < ${trace.timestamps[i - 1]}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if trace contains duplicate consecutive activities.
 */
export function hasDuplicateConsecutiveActivities(trace: Trace): { hasDuplicates: boolean; positions: number[] } {
  const positions: number[] = [];

  for (let i = 1; i < trace.activities.length; i++) {
    if (trace.activities[i] === trace.activities[i - 1]) {
      positions.push(i);
    }
  }

  return {
    hasDuplicates: positions.length > 0,
    positions,
  };
}

/**
 * Check if trace contains self-loops (activity appears twice with activities in between).
 */
export function hasSelfLoops(trace: Trace): { hasLoops: boolean; loops: Array<{ activity: string; positions: number[] }> } {
  const activityPositions = new Map<string, number[]>();
  const loops: Array<{ activity: string; positions: number[] }> = [];

  // Record positions
  for (let i = 0; i < trace.activities.length; i++) {
    const activity = trace.activities[i];
    if (!activityPositions.has(activity)) {
      activityPositions.set(activity, []);
    }
    activityPositions.get(activity)!.push(i);
  }

  // Find activities that appear more than once
  for (const [activity, positions] of activityPositions) {
    if (positions.length > 1) {
      // Check if there are activities between occurrences
      let hasIntermediate = false;
      for (let i = 0; i < positions.length - 1; i++) {
        if (positions[i + 1] - positions[i] > 1) {
          hasIntermediate = true;
          break;
        }
      }

      if (hasIntermediate) {
        loops.push({ activity, positions });
      }
    }
  }

  return {
    hasLoops: loops.length > 0,
    loops,
  };
}

// ─── Trace Statistics ─────────────────────────────────────────────────────

/**
 * Compute trace length statistics.
 */
export function computeTraceStatistics(traces: Trace[]): {
  count: number;
  minLength: number;
  maxLength: number;
  avgLength: number;
  lengthDistribution: Map<number, number>;
} {
  if (traces.length === 0) {
    return {
      count: 0,
      minLength: 0,
      maxLength: 0,
      avgLength: 0,
      lengthDistribution: new Map(),
    };
  }

  const lengths = traces.map(t => t.activities.length);
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);
  const avgLength = lengths.reduce((sum, len) => sum + len, 0) / traces.length;

  const lengthDistribution = new Map<number, number>();
  for (const len of lengths) {
    lengthDistribution.set(len, (lengthDistribution.get(len) || 0) + 1);
  }

  return {
    count: traces.length,
    minLength,
    maxLength,
    avgLength,
    lengthDistribution,
  };
}

/**
 * Get unique activities from traces.
 */
export function getUniqueActivities(traces: Trace[]): string[] {
  const activities = new Set<string>();

  for (const trace of traces) {
    for (const activity of trace.activities) {
      activities.add(activity);
    }
  }

  return Array.from(activities).sort();
}

/**
 * Compute activity frequency across all traces.
 */
export function computeActivityFrequency(traces: Trace[]): Map<string, number> {
  const frequency = new Map<string, number>();

  for (const trace of traces) {
    for (const activity of trace.activities) {
      frequency.set(activity, (frequency.get(activity) || 0) + 1);
    }
  }

  return frequency;
}

/**
 * Find the most common trace variant.
 */
export function findMostCommonVariant(traces: Trace[]): { trace: string[]; count: number } | null {
  if (traces.length === 0) return null;

  const variantCounts = new Map<string, { trace: string[]; count: number }>();

  for (const trace of traces) {
    const key = trace.activities.join(',');
    const existing = variantCounts.get(key);

    if (existing) {
      existing.count++;
    } else {
      variantCounts.set(key, { trace: [...trace.activities], count: 1 });
    }
  }

  let mostCommon: { trace: string[]; count: number } | null = null;

  for (const variant of variantCounts.values()) {
    if (!mostCommon || variant.count > mostCommon.count) {
      mostCommon = variant;
    }
  }

  return mostCommon;
}

// ─── Test Helpers ─────────────────────────────────────────────────────────

/**
 * Create a test trace.
 */
export function createTestTrace(activities: string[], caseId = 'test-case'): Trace {
  return {
    caseId,
    activities,
    timestamps: activities.map((_, i) => {
      const date = new Date(2026, 0, 1, 0, i);
      return date.toISOString();
    }),
  };
}

/**
 * Create test traces for common process patterns.
 */
export function createTestTraces(): {
  sequential: Trace[];
  parallel: Trace[];
  choice: Trace[];
  loop: Trace[];
} {
  return {
    sequential: [
      createTestTrace(['A', 'B', 'C', 'D'], 'case-1'),
      createTestTrace(['A', 'B', 'C', 'D'], 'case-2'),
    ],
    parallel: [
      createTestTrace(['A', 'B', 'C', 'D'], 'case-1'),
      createTestTrace(['A', 'C', 'B', 'D'], 'case-2'),
    ],
    choice: [
      createTestTrace(['A', 'B', 'D'], 'case-1'),
      createTestTrace(['A', 'C', 'D'], 'case-2'),
    ],
    loop: [
      createTestTrace(['A', 'B', 'D'], 'case-1'),
      createTestTrace(['A', 'B', 'C', 'B', 'D'], 'case-2'),
      createTestTrace(['A', 'B', 'C', 'B', 'C', 'B', 'D'], 'case-3'),
    ],
  };
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Format trace as human-readable string.
 */
export function formatTrace(trace: Trace): string {
  const parts = [`${trace.caseId}: [${trace.activities.join(' -> ')}]`];

  if (trace.timestamps && trace.timestamps.length > 0) {
    parts.push(`Timestamps: ${trace.timestamps.length} events`);
  }

  if (trace.attributes) {
    const attrs = Object.entries(trace.attributes)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    parts.push(`Attributes: ${attrs}`);
  }

  return parts.join(' | ');
}

/**
 * Format trace comparison as human-readable string.
 */
export function formatTraceComparison(comparison: TraceComparison): string {
  const lines: string[] = [];

  lines.push(`Trace Comparison: ${comparison.equal ? 'EQUAL' : 'DIFFERENT'}`);
  lines.push(`Type: ${comparison.type}`);

  if (comparison.differences.length > 0) {
    lines.push('Differences:');
    for (const diff of comparison.differences) {
      lines.push(`  - ${diff}`);
    }
  }

  return lines.join('\n');
}

/**
 * Serialize trace to JSON string.
 */
export function serializeTrace(trace: Trace): string {
  return JSON.stringify(trace, null, 2);
}

/**
 * Deserialize trace from JSON string.
 */
export function deserializeTrace(json: string): Trace {
  return JSON.parse(json);
}

/**
 * Convert trace to simple string array.
 */
export function traceToArray(trace: Trace): string[] {
  return [...trace.activities];
}

/**
 * Convert string array to trace.
 */
export function arrayToTrace(activities: string[], caseId = 'trace'): Trace {
  return {
    caseId,
    activities,
  };
}

/**
 * Check if trace is a subsequence of another trace.
 */
export function isSubsequence(subsequence: string[], trace: string[]): boolean {
  let subIdx = 0;

  for (const activity of trace) {
    if (subIdx < subsequence.length && activity === subsequence[subIdx]) {
      subIdx++;
    }
  }

  return subIdx === subsequence.length;
}

/**
 * Find the longest common subsequence of two traces.
 */
export function longestCommonSubsequence(trace1: string[], trace2: string[]): string[] {
  const m = trace1.length;
  const n = trace2.length;

  // Build LCS table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (trace1[i - 1] === trace2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (trace1[i - 1] === trace2[j - 1]) {
      lcs.unshift(trace1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Compute trace similarity based on LCS length.
 */
export function traceSimilarity(trace1: string[], trace2: string[]): number {
  const lcs = longestCommonSubsequence(trace1, trace2);
  const maxLength = Math.max(trace1.length, trace2.length);

  return maxLength > 0 ? lcs.length / maxLength : 0;
}
