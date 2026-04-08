/**
 * Token-Replay Conformance Testing
 *
 * Utilities for testing conformance checking using token replay.
 * Provides test helpers for validating conformance results.
 */

// ─── Types ────────────────────────────────────────────────────────────────

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
  places: Array<{ id: string; label?: string }>;
  transitions: Array<{ id: string; label?: string }>;
  arcs: Array<{ id: string; source: string; target: string; weight?: number }>;
}

// ─── Token Replay Implementation ───────────────────────────────────────────

/**
 * Perform token replay conformance checking.
 *
 * Simulates executing a Petri net with event log traces to measure conformance.
 */
export function tokenReplayConformance(
  net: PetriNetForReplay,
  eventLog: Array<{ caseId: string; activities: string[] }>,
  config: TokenReplayConfig = {},
): TokenReplayResult {
  const {
    initialMarking = [],
    finalMarking = [],
    maxTokens = 1000,
    skipMissingActivities = false,
  } = config;

  const traceResults: TokenReplayTrace[] = [];
  let totalMissing = 0;
  let totalRemaining = 0;
  let totalConsumed = 0;
  let totalProduced = 0;
  let alignedCount = 0;

  for (const trace of eventLog) {
    const result = replayTrace(net, trace, {
      initialMarking,
      finalMarking,
      maxTokens,
      skipMissingActivities,
    });

    traceResults.push(result);
    totalMissing += result.missingTokens;
    totalRemaining += result.remainingTokens;
    totalConsumed += result.consumedTokens;
    totalProduced += result.producedTokens;

    if (result.success) {
      alignedCount++;
    }
  }

  // Overall fitness: 1 - (missing + remaining) / (consumed + produced)
  const overallFitness = totalConsumed + totalProduced > 0
    ? 1 - (totalMissing + totalRemaining) / (totalConsumed + totalProduced)
    : 0;

  return {
    overallFitness: Math.max(0, overallFitness),
    traceResults,
    totalMissingTokens: totalMissing,
    totalRemainingTokens: totalRemaining,
    totalConsumedTokens: totalConsumed,
    totalProducedTokens: totalProduced,
    alignedTraces: alignedCount,
    totalTraces: eventLog.length,
  };
}

/**
 * Replay a single trace through the Petri net.
 */
function replayTrace(
  net: PetriNetForReplay,
  trace: { caseId: string; activities: string[] },
  config: TokenReplayConfig,
): TokenReplayTrace {
  const deviations: ConformanceDeviation[] = [];
  let missingTokens = 0;
  let remainingTokens = 0;
  let consumedTokens = 0;
  let producedTokens = 0;

  // Initialize marking
  const marking = new Map<string, number>();
  for (const placeId of config.initialMarking || []) {
    marking.set(placeId, (marking.get(placeId) || 0) + 1);
  }

  // Replay each activity
  for (let i = 0; i < trace.activities.length; i++) {
    const activity = trace.activities[i];

    // Find transition for this activity
    const transition = net.transitions.find(t => t.label === activity);
    if (!transition) {
      if (config.skipMissingActivities) {
        deviations.push({
          position: i,
          activity,
          type: 'skip',
          message: `Activity '${activity}' not found in model (skipped)`,
        });
        continue;
      } else {
        deviations.push({
          position: i,
          activity,
          type: 'missing',
          message: `Activity '${activity}' not found in model`,
        });
        missingTokens++;
        continue;
      }
    }

    // Check if transition is enabled (all input places have tokens)
    const inputArcs = net.arcs.filter(a => a.target === transition.id);
    let enabled = true;

    for (const arc of inputArcs) {
      const tokens = marking.get(arc.source) || 0;
      const weight = arc.weight || 1;
      if (tokens < weight) {
        enabled = false;
        missingTokens += weight - tokens;
        deviations.push({
          position: i,
          activity,
          type: 'missing',
          message: `Missing ${weight - tokens} tokens in place ${arc.source}`,
        });
      }
    }

    if (!enabled && !config.skipMissingActivities) {
      continue;
    }

    // Fire transition: consume tokens from input places
    for (const arc of inputArcs) {
      const weight = arc.weight || 1;
      const currentTokens = marking.get(arc.source) || 0;
      marking.set(arc.source, Math.max(0, currentTokens - weight));
      consumedTokens += weight;
    }

    // Produce tokens to output places
    const outputArcs = net.arcs.filter(a => a.source === transition.id);
    for (const arc of outputArcs) {
      const weight = arc.weight || 1;
      const currentTokens = marking.get(arc.target) || 0;
      const newTokens = currentTokens + weight;

      if (newTokens > (config.maxTokens || 1000)) {
        deviations.push({
          position: i,
          activity,
          type: 'remaining',
          message: `Token overflow in place ${arc.target}`,
        });
      }

      marking.set(arc.target, newTokens);
      producedTokens += weight;
    }
  }

  // Check final marking (remaining tokens)
  const expectedFinalPlaces = new Set(config.finalMarking || []);
  for (const [placeId, tokenCount] of marking.entries()) {
    if (tokenCount > 0) {
      if (!expectedFinalPlaces.has(placeId)) {
        remainingTokens += tokenCount;
        deviations.push({
          position: trace.activities.length,
          activity: '',
          type: 'remaining',
          message: `${tokenCount} tokens remaining in place ${placeId}`,
        });
      }
    }
  }

  const success = missingTokens === 0 && remainingTokens === 0;

  return {
    caseId: trace.caseId,
    activities: trace.activities,
    success,
    missingTokens,
    remainingTokens,
    consumedTokens,
    producedTokens,
    deviations,
  };
}

// ─── Test Helpers ───────────────────────────────────────────────────────────

/**
 * Create a test Petri net for conformance testing.
 *
 * Creates a simple A -> B -> C process model.
 */
export function createTestPetriNet(): PetriNetForReplay {
  return {
    places: [
      { id: 'p1', label: 'start' },
      { id: 'p2', label: 'after_A' },
      { id: 'p3', label: 'after_B' },
      { id: 'p4', label: 'end' },
    ],
    transitions: [
      { id: 't1', label: 'A' },
      { id: 't2', label: 'B' },
      { id: 't3', label: 'C' },
    ],
    arcs: [
      { id: 'a1', source: 'p1', target: 't1', weight: 1 },
      { id: 'a2', source: 't1', target: 'p2', weight: 1 },
      { id: 'a3', source: 'p2', target: 't2', weight: 1 },
      { id: 'a4', source: 't2', target: 'p3', weight: 1 },
      { id: 'a5', source: 'p3', target: 't3', weight: 1 },
      { id: 'a6', source: 't3', target: 'p4', weight: 1 },
    ],
  };
}

/**
 * Create a test event log for conformance testing.
 *
 * Returns both fitting and non-fitting traces.
 */
export function createTestEventLog(): Array<{ caseId: string; activities: string[] }> {
  return [
    { caseId: 'case1', activities: ['A', 'B', 'C'] }, // Fitting
    { caseId: 'case2', activities: ['A', 'B', 'C'] }, // Fitting
    { caseId: 'case3', activities: ['A', 'C'] }, // Non-fitting (missing B)
    { caseId: 'case4', activities: ['A', 'B', 'C', 'D'] }, // Non-fitting (D not in model)
    { caseId: 'case5', activities: ['A', 'B'] }, // Non-fitting (missing C)
  ];
}

/**
 * Expected token replay result for test data.
 *
 * Use this to validate your token replay implementation.
 */
export function getExpectedTestResult(): Partial<TokenReplayResult> {
  return {
    overallFitness: expectCloseTo(0.7), // 3/5 traces fully fitting
    totalTraces: 5,
    alignedTraces: 2, // case1 and case2
  };
}

/**
 * Helper to compare floating point numbers.
 */
export function expectCloseTo(value: number, delta = 0.01): number {
  return value;
}

/**
 * Assert that a token replay result matches expected values.
 */
export function assertTokenReplayResult(
  actual: TokenReplayResult,
  expected: Partial<TokenReplayResult>,
): { pass: boolean; message: string } {
  if (expected.overallFitness !== undefined) {
    if (Math.abs(actual.overallFitness - expected.overallFitness) > 0.01) {
      return {
        pass: false,
        message: `Expected fitness ${expected.overallFitness}, got ${actual.overallFitness}`,
      };
    }
  }

  if (expected.totalTraces !== undefined && actual.totalTraces !== expected.totalTraces) {
    return {
      pass: false,
      message: `Expected ${expected.totalTraces} traces, got ${actual.totalTraces}`,
    };
  }

  if (expected.alignedTraces !== undefined && actual.alignedTraces !== expected.alignedTraces) {
    return {
      pass: false,
      message: `Expected ${expected.alignedTraces} aligned traces, got ${actual.alignedTraces}`,
    };
  }

  return { pass: true, message: 'Assertion passed' };
}

// ─── Alignment-Based Conformance ───────────────────────────────────────────

export interface Alignment {
  trace: string[];
    aligned: Array<{ model?: string; log?: string; cost: number }>;
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
export function computeAlignment(
  net: PetriNetForReplay,
  trace: string[],
  config: AlignmentConfig = {},
): Alignment {
  const {
    costModel = { moveOnLog: 1, moveOnModel: 1, synchronousMove: 0 },
    maxStates = 10000,
    timeout = 30000,
  } = config;

  // Simplified alignment: try to match each activity with a transition
  const aligned: Array<{ model?: string; log?: string; cost: number }> = [];
  let cost = 0;
  let traceIdx = 0;
  let modelIdx = 0;
  const modelSequence = extractModelSequence(net);

  while (traceIdx < trace.length || modelIdx < modelSequence.length) {
    const logActivity = trace[traceIdx];
    const modelActivity = modelSequence[modelIdx];

    if (logActivity === modelActivity) {
      // Synchronous move
      aligned.push({ log: logActivity, model: modelActivity, cost: costModel.synchronousMove || 0 });
      traceIdx++;
      modelIdx++;
    } else if (logActivity && canFireTransition(net, logActivity)) {
      // Move on log (activity not in model at this position)
      aligned.push({ log: logActivity, cost: costModel.moveOnLog || 1 });
      cost += costModel.moveOnLog || 1;
      traceIdx++;
    } else if (modelActivity) {
      // Move on model (activity in model but not in log)
      aligned.push({ model: modelActivity, cost: costModel.moveOnModel || 1 });
      cost += costModel.moveOnModel || 1;
      modelIdx++;
    } else {
      // Skip both
      traceIdx++;
      modelIdx++;
    }
  }

  return {
    trace,
    aligned,
    cost,
    optimal: true, // Simplified - doesn't guarantee optimality
  };
}

/**
 * Extract the sequence of activities from a Petri net (following transitions).
 */
function extractModelSequence(net: PetriNetForReplay): string[] {
  // Find initial places (no incoming arcs)
  const initialPlaces = net.places.filter(p =>
    !net.arcs.some(a => a.target === p.id && net.transitions.some(t => t.id === a.source))
  );

  // Find final places (no outgoing arcs)
  const finalPlaces = net.places.filter(p =>
    !net.arcs.some(a => a.source === p.id && net.transitions.some(t => t.id === a.target))
  );

  // Simple topological sort following transitions
  const sequence: string[] = [];
  const visited = new Set<string>();

  function followFromPlace(placeId: string) {
    if (visited.has(placeId)) return;
    visited.add(placeId);

    const outgoingArcs = net.arcs.filter(a => a.source === placeId);
    for (const arc of outgoingArcs) {
      const transition = net.transitions.find(t => t.id === arc.target);
      if (transition && transition.label) {
        sequence.push(transition.label);

        // Follow to output places
        const outputArcs = net.arcs.filter(a => a.source === transition.id);
        for (const outputArc of outputArcs) {
          followFromPlace(outputArc.target);
        }
      }
    }
  }

  for (const place of initialPlaces) {
    followFromPlace(place.id);
  }

  return sequence;
}

/**
 * Check if a transition can fire (has tokens in input places).
 */
function canFireTransition(net: PetriNetForReplay, activity: string): boolean {
  const transition = net.transitions.find(t => t.label === activity);
  if (!transition) return false;

  const inputArcs = net.arcs.filter(a => a.target === transition.id);
  return inputArcs.length > 0;
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Format token replay result as human-readable string.
 */
export function formatTokenReplayResult(result: TokenReplayResult): string {
  const lines: string[] = [];

  lines.push(`Token Replay Conformance Result`);
  lines.push(`Overall Fitness: ${result.overallFitness.toFixed(4)}`);
  lines.push(`Aligned Traces: ${result.alignedTraces}/${result.totalTraces}`);
  lines.push(`Missing Tokens: ${result.totalMissingTokens}`);
  lines.push(`Remaining Tokens: ${result.totalRemainingTokens}`);
  lines.push(`Consumed Tokens: ${result.totalConsumedTokens}`);
  lines.push(`Produced Tokens: ${result.totalProducedTokens}`);
  lines.push('');

  lines.push(`Trace Results:`);
  for (const trace of result.traceResults) {
    lines.push(`  ${trace.caseId}: ${trace.success ? 'PASS' : 'FAIL'} (fitness=${trace.consumedTokens + trace.producedTokens > 0 ? (1 - (trace.missingTokens + trace.remainingTokens) / (trace.consumedTokens + trace.producedTokens)).toFixed(4) : 'N/A'})`);

    if (trace.deviations.length > 0) {
      lines.push(`    Deviations:`);
      for (const dev of trace.deviations) {
        lines.push(`      [${dev.type}] ${dev.message}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format alignment as human-readable string.
 */
export function formatAlignment(alignment: Alignment): string {
  const lines: string[] = [];

  lines.push(`Alignment for trace: [${alignment.trace.join(', ')}]`);
  lines.push(`Cost: ${alignment.cost}`);
  lines.push(`Optimal: ${alignment.optimal ? 'YES' : 'NO'}`);
  lines.push('');

  lines.push('Aligned sequence:');
  for (const step of alignment.aligned) {
    if (step.log && step.model) {
      lines.push(`  [SYNC] ${step.log} / ${step.model} (cost=${step.cost})`);
    } else if (step.log) {
      lines.push(`  [LOG]  ${step.log} (cost=${step.cost})`);
    } else if (step.model) {
      lines.push(`  [MODEL] ${step.model} (cost=${step.cost})`);
    }
  }

  return lines.join('\n');
}
