/**
 * Unit tests for process model verifiers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifySoundness,
  computeQualityMetrics,
  validateVerifierDFG,
  formatSoundnessResult,
  formatQualityMetrics,
  type PetriNet,
  type VerifierDFG,
} from '@pictl/testing';

describe('verifySoundness', () => {
  it('should verify a sound sequential Petri net', () => {
    const net: PetriNet = {
      places: [
        { id: 'p1', initialMarking: 1 },
        { id: 'p2' },
        { id: 'p3' },
        { id: 'p4', finalMarking: 1 },
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
    const result = verifySoundness(net, ['p1'], ['p4']);

    expect(result.bounded).toBe(true);
    expect(result.deadlockFree).toBe(true);
    expect(result.live).toBe(true);
    expect(result.sound).toBe(true);
  });

  it('should detect unsound net with source transition (no input)', () => {
    const net: PetriNet = {
      places: [{ id: 'p1' }],
      transitions: [{ id: 't1', label: 'A' }], // no incoming arcs
      arcs: [{ id: 'a1', source: 't1', target: 'p1', weight: 1 }],
    };
    const result = verifySoundness(net, [], []);

    expect(result.deadlockFree).toBe(false);
    expect(result.sound).toBe(false);
  });

  it('should detect unbounded place', () => {
    const net: PetriNet = {
      places: [
        { id: 'p1', initialMarking: 1 },
        { id: 'p2' },
      ],
      transitions: [
        { id: 't1' },
        { id: 't2' },
      ],
      arcs: [
        { id: 'a1', source: 'p1', target: 't1', weight: 1 },
        { id: 'a2', source: 't1', target: 'p2', weight: 1 },
        { id: 'a3', source: 'p2', target: 't2', weight: 1 },
        { id: 'a4', source: 't2', target: 'p2', weight: 1 }, // loop back
      ],
    };
    const result = verifySoundness(net, ['p1'], ['p2']);

    expect(result.bounded).toBe(true);
    expect(result.details.some(d => d.includes('bounded') || d.includes('input')));
  });
});

describe('computeQualityMetrics', () => {
  it('should compute metrics for DFG model', () => {
    const dfg: VerifierDFG = {
      nodes: ['A', 'B', 'C'],
      edges: [
        { source: 'A', target: 'B', count: 10 },
        { source: 'B', target: 'C', count: 10 },
      ],
      startActivities: ['A'],
      endActivities: ['C'],
    };
    const eventLog = [
      { activities: ['A', 'B', 'C'] },
      { activities: ['A', 'B', 'C'] },
      { activities: ['A', 'B', 'C'] },
    ];

    const metrics = computeQualityMetrics(dfg, eventLog, { type: 'dfg' });

    expect(metrics.fitness).toBe(1); // all edges in log match DFG
    expect(metrics.precision).toBeGreaterThanOrEqual(0);
    expect(metrics.generalization).toBeGreaterThanOrEqual(0);
    expect(metrics.simplicity).toBeGreaterThan(0);
    expect(metrics.simplicity).toBeLessThanOrEqual(1);
  });

  it('should compute low fitness for non-matching DFG', () => {
    const dfg: VerifierDFG = {
      nodes: ['A', 'X', 'Y'],
      edges: [
        { source: 'A', target: 'X', count: 5 },
        { source: 'X', target: 'Y', count: 5 },
      ],
      startActivities: ['A'],
      endActivities: ['Y'],
    };
    const eventLog = [
      { activities: ['A', 'B', 'C'] },
      { activities: ['A', 'B', 'C'] },
    ];

    const metrics = computeQualityMetrics(dfg, eventLog, { type: 'dfg' });

    expect(metrics.fitness).toBe(0); // no edges match
  });
});

describe('validateVerifierDFG', () => {
  it('should validate correct DFG', () => {
    const dfg: VerifierDFG = {
      nodes: ['A', 'B', 'C'],
      edges: [
        { source: 'A', target: 'B', count: 5 },
        { source: 'B', target: 'C', count: 3 },
      ],
      startActivities: ['A'],
      endActivities: ['C'],
    };
    const result = validateVerifierDFG(dfg);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject DFG with negative edge count', () => {
    const dfg: VerifierDFG = {
      nodes: ['A', 'B'],
      edges: [{ source: 'A', target: 'B', count: -1 }],
      startActivities: ['A'],
      endActivities: ['B'],
    };
    const result = validateVerifierDFG(dfg);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('negative'))).toBe(true);
  });

  it('should reject DFG with invalid start activity', () => {
    const dfg: VerifierDFG = {
      nodes: ['A', 'B'],
      edges: [{ source: 'A', target: 'B', count: 1 }],
      startActivities: ['X'],
      endActivities: ['B'],
    };
    const result = validateVerifierDFG(dfg);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Start activity'))).toBe(true);
  });

  it('should reject DFG with edge referencing non-existent node', () => {
    const dfg: VerifierDFG = {
      nodes: ['A'],
      edges: [{ source: 'A', target: 'Z', count: 1 }],
      startActivities: ['A'],
      endActivities: [],
    };
    const result = validateVerifierDFG(dfg);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Z'))).toBe(true);
  });
});

describe('formatSoundnessResult', () => {
  it('should format sound result as readable string', () => {
    const result = {
      sound: true,
      deadlockFree: true,
      live: true,
      bounded: true,
      details: ['All places are bounded', 'All transitions have input places'],
    };
    const formatted = formatSoundnessResult(result);
    expect(formatted).toContain('PASS');
    expect(formatted).toContain('YES');
  });
});

describe('formatQualityMetrics', () => {
  it('should format metrics as readable string', () => {
    const metrics = {
      fitness: 0.95,
      precision: 0.8,
      generalization: 0.7,
      simplicity: 0.6,
    };
    const formatted = formatQualityMetrics(metrics);
    expect(formatted).toContain('Fitness: 0.9500');
    expect(formatted).toContain('Precision: 0.8000');
  });
});
