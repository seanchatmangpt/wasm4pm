/**
 * Unit tests for token replay conformance checking
 */

import { describe, it, expect } from 'vitest';
import {
  tokenReplayConformance,
  computeAlignment,
  createTestPetriNet,
  createTestEventLog,
  assertTokenReplayResult,
  formatTokenReplayResult,
  formatAlignment,
  type TokenReplayResult,
} from '@pictl/testing';

describe('tokenReplayConformance', () => {
  it('should return fitness 1.0 for perfectly fitting traces', () => {
    const net = createTestPetriNet();
    const eventLog = [
      { caseId: 'case1', activities: ['A', 'B', 'C'] },
      { caseId: 'case2', activities: ['A', 'B', 'C'] },
    ];

    const result = tokenReplayConformance(net, eventLog, {
      initialMarking: ['p1'],
      finalMarking: ['p4'],
    });

    expect(result.overallFitness).toBe(1);
    expect(result.alignedTraces).toBe(2);
    expect(result.totalTraces).toBe(2);
    expect(result.totalMissingTokens).toBe(0);
    expect(result.totalRemainingTokens).toBe(0);
  });

  it('should detect non-fitting traces', () => {
    const net = createTestPetriNet();
    const eventLog = createTestEventLog();

    const result = tokenReplayConformance(net, eventLog, {
      initialMarking: ['p1'],
      finalMarking: ['p4'],
    });

    // case3 (A, C) and case4 (A, B, C, D) and case5 (A, B) are non-fitting
    expect(result.overallFitness).toBeLessThan(1);
    expect(result.alignedTraces).toBe(2); // case1 and case2
  });

  it('should handle empty event log', () => {
    const net = createTestPetriNet();
    const result = tokenReplayConformance(net, [], {
      initialMarking: ['p1'],
      finalMarking: ['p4'],
    });

    expect(result.overallFitness).toBe(0);
    expect(result.totalTraces).toBe(0);
  });

  it('should skip missing activities when configured', () => {
    const net = createTestPetriNet();
    const eventLog = [
      { caseId: 'case1', activities: ['A', 'B', 'C', 'D'] }, // D not in model
    ];

    const result = tokenReplayConformance(net, eventLog, {
      initialMarking: ['p1'],
      finalMarking: ['p4'],
      skipMissingActivities: true,
    });

    // D is skipped, so A, B, C should produce fitness 1.0
    expect(result.overallFitness).toBe(1);
    expect(result.traceResults[0].deviations.some(d => d.type === 'skip')).toBe(true);
  });
});

describe('computeAlignment', () => {
  it('should align fitting trace synchronously', () => {
    const net = createTestPetriNet();
    const alignment = computeAlignment(net, ['A', 'B', 'C']);

    expect(alignment.trace).toEqual(['A', 'B', 'C']);
    expect(alignment.cost).toBe(0);
    expect(alignment.aligned.length).toBe(3);

    // All moves should be synchronous
    for (const step of alignment.aligned) {
      expect(step.log).toBe(step.model);
      expect(step.cost).toBe(0);
    }
  });

  it('should detect misaligned activity with move on log', () => {
    const net = createTestPetriNet();
    const alignment = computeAlignment(net, ['A', 'X', 'B', 'C']);

    expect(alignment.cost).toBeGreaterThan(0);
    const logOnlyMoves = alignment.aligned.filter(s => s.log && !s.model);
    expect(logOnlyMoves.length).toBeGreaterThan(0);
  });
});

describe('createTestPetriNet', () => {
  it('should create a valid A -> B -> C Petri net', () => {
    const net = createTestPetriNet();
    expect(net.places).toHaveLength(4);
    expect(net.transitions).toHaveLength(3);
    expect(net.arcs).toHaveLength(6);

    const labels = net.transitions.map(t => t.label);
    expect(labels).toEqual(['A', 'B', 'C']);
  });
});

describe('createTestEventLog', () => {
  it('should create test event log with 5 traces', () => {
    const log = createTestEventLog();
    expect(log).toHaveLength(5);
    expect(log[0].activities).toEqual(['A', 'B', 'C']);
    expect(log[2].activities).toEqual(['A', 'C']); // non-fitting
  });
});

describe('assertTokenReplayResult', () => {
  it('should pass for matching expected values', () => {
    const result: TokenReplayResult = {
      overallFitness: 0.8,
      traceResults: [],
      totalMissingTokens: 1,
      totalRemainingTokens: 1,
      totalConsumedTokens: 8,
      totalProducedTokens: 8,
      alignedTraces: 4,
      totalTraces: 5,
    };

    const assertion = assertTokenReplayResult(result, {
      overallFitness: 0.8,
      totalTraces: 5,
      alignedTraces: 4,
    });

    expect(assertion.pass).toBe(true);
  });

  it('should fail for mismatched values', () => {
    const result: TokenReplayResult = {
      overallFitness: 0.5,
      traceResults: [],
      totalMissingTokens: 2,
      totalRemainingTokens: 2,
      totalConsumedTokens: 6,
      totalProducedTokens: 6,
      alignedTraces: 2,
      totalTraces: 5,
    };

    const assertion = assertTokenReplayResult(result, {
      overallFitness: 0.9,
    });

    expect(assertion.pass).toBe(false);
    expect(assertion.message).toContain('fitness');
  });
});

describe('formatTokenReplayResult', () => {
  it('should format result as readable string', () => {
    const result: TokenReplayResult = {
      overallFitness: 0.6,
      traceResults: [
        {
          caseId: 'case1',
          activities: ['A', 'B', 'C'],
          success: true,
          missingTokens: 0,
          remainingTokens: 0,
          consumedTokens: 3,
          producedTokens: 3,
          deviations: [],
        },
      ],
      totalMissingTokens: 2,
      totalRemainingTokens: 1,
      totalConsumedTokens: 5,
      totalProducedTokens: 5,
      alignedTraces: 1,
      totalTraces: 2,
    };
    const formatted = formatTokenReplayResult(result);
    expect(formatted).toContain('0.6000');
    expect(formatted).toContain('1/2');
  });
});

describe('formatAlignment', () => {
  it('should format alignment as readable string', () => {
    const alignment = {
      trace: ['A', 'B', 'C'],
      aligned: [
        { log: 'A', model: 'A', cost: 0 },
        { log: 'B', model: 'B', cost: 0 },
        { log: 'C', model: 'C', cost: 0 },
      ],
      cost: 0,
      optimal: true,
    };
    const formatted = formatAlignment(alignment);
    expect(formatted).toContain('SYNC');
    expect(formatted).toContain('Cost: 0');
  });
});
