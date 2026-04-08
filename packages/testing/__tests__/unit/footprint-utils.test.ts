/**
 * Unit tests for footprint utilities
 */

import { describe, it, expect } from 'vitest';
import {
  extractFootprintsFromLog,
  extractFootprintsFromDFG,
  compareFootprints,
  areFootprintsEquivalent,
  createSequentialFootprint,
  createParallelFootprint,
  createChoiceFootprint,
  formatFootprints,
  formatFootprintComparison,
  serializeFootprints,
  deserializeFootprints,
  computeFootprintEntropy,
  type FootprintMatrix,
} from '@pictl/testing';

describe('extractFootprintsFromLog', () => {
  it('should extract sequence footprints from sequential log', () => {
    const eventLog = [
      { activities: ['A', 'B', 'C'] },
      { activities: ['A', 'B', 'C'] },
    ];
    const fp = extractFootprintsFromLog(eventLog);

    expect(fp.activities).toEqual(['A', 'B', 'C']);
    expect(fp.matrix.get('A')!.get('B')).toBe('sequence');
    expect(fp.matrix.get('B')!.get('C')).toBe('sequence');
    expect(fp.matrix.get('A')!.get('C')).toBe('sequence');
  });

  it('should extract parallel footprints from concurrent log', () => {
    const eventLog = [
      { activities: ['A', 'B', 'C', 'D'] },
      { activities: ['A', 'C', 'B', 'D'] },
    ];
    const fp = extractFootprintsFromLog(eventLog);

    // B and C appear in both orders: parallel
    expect(fp.matrix.get('B')!.get('C')).toBe('parallel');
    expect(fp.matrix.get('C')!.get('B')).toBe('parallel');
  });

  it('should extract choice footprints from exclusive log', () => {
    const eventLog = [
      { activities: ['A', 'B', 'D'] },
      { activities: ['A', 'C', 'D'] },
    ];
    const fp = extractFootprintsFromLog(eventLog);

    // B and C never co-occur: choice
    expect(fp.matrix.get('B')!.get('C')).toBe('choice');
    expect(fp.matrix.get('C')!.get('B')).toBe('choice');
  });

  it('should handle empty event log', () => {
    const fp = extractFootprintsFromLog([]);
    expect(fp.activities).toEqual([]);
    expect(fp.matrix.size).toBe(0);
  });
});

describe('extractFootprintsFromDFG', () => {
  it('should extract sequence relations from DFG edges', () => {
    const dfg = {
      nodes: ['A', 'B', 'C'],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
      ],
    };
    const fp = extractFootprintsFromDFG(dfg);

    expect(fp.activities).toEqual(['A', 'B', 'C']);
    expect(fp.matrix.get('A')!.get('B')).toBe('sequence');
    expect(fp.matrix.get('B')!.get('C')).toBe('sequence');
  });

  it('should detect parallel from bidirectional edges', () => {
    const dfg = {
      nodes: ['A', 'B'],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'A' },
      ],
    };
    const fp = extractFootprintsFromDFG(dfg);

    expect(fp.matrix.get('A')!.get('B')).toBe('parallel');
    expect(fp.matrix.get('B')!.get('A')).toBe('parallel');
  });
});

describe('compareFootprints', () => {
  it('should detect equivalent footprints', () => {
    const fp1 = createSequentialFootprint();
    const fp2 = createSequentialFootprint();
    const result = compareFootprints(fp1, fp2);

    expect(result.equivalent).toBe(true);
    expect(result.relationMismatches).toBe(0);
  });

  it('should detect different footprints', () => {
    const fp1 = createSequentialFootprint();
    const fp2 = createParallelFootprint();
    const result = compareFootprints(fp1, fp2);

    // Different activities (3 vs 4) and different relations
    expect(result.equivalent).toBe(false);
    expect(result.relationMismatches).toBeGreaterThan(0);
  });
});

describe('areFootprintsEquivalent', () => {
  it('should return true for same footprints', () => {
    expect(areFootprintsEquivalent(createChoiceFootprint(), createChoiceFootprint())).toBe(true);
  });

  it('should return false for different footprints', () => {
    expect(areFootprintsEquivalent(createSequentialFootprint(), createParallelFootprint())).toBe(false);
  });
});

describe('Test Fixtures', () => {
  it('should create valid sequential footprint', () => {
    const fp = createSequentialFootprint();
    expect(fp.activities).toEqual(['A', 'B', 'C']);
    expect(fp.matrix.get('A')!.get('B')).toBe('sequence');
  });

  it('should create valid parallel footprint', () => {
    const fp = createParallelFootprint();
    expect(fp.activities).toEqual(['A', 'B', 'C', 'D']);
    expect(fp.matrix.get('B')!.get('C')).toBe('parallel');
  });

  it('should create valid choice footprint', () => {
    const fp = createChoiceFootprint();
    expect(fp.activities).toEqual(['A', 'B', 'C', 'D']);
    expect(fp.matrix.get('B')!.get('C')).toBe('choice');
  });
});

describe('serializeFootprints / deserializeFootprints', () => {
  it('should round-trip footprint through JSON', () => {
    const original = createSequentialFootprint();
    const json = serializeFootprints(original);
    const restored = deserializeFootprints(json);

    expect(restored.activities).toEqual(original.activities);
    expect(restored.matrix.get('A')!.get('B')).toBe('sequence');
  });
});

describe('computeFootprintEntropy', () => {
  it('should return 0 for empty footprint', () => {
    const fp: FootprintMatrix = { activities: [], matrix: new Map() };
    expect(computeFootprintEntropy(fp)).toBe(0);
  });

  it('should return 0 for single-activity footprint', () => {
    const fp: FootprintMatrix = {
      activities: ['A'],
      matrix: new Map([['A', new Map([['A', 'no_relation']])]]),
    };
    expect(computeFootprintEntropy(fp)).toBe(0);
  });

  it('should return positive entropy for mixed relations', () => {
    const fp = createParallelFootprint(); // has sequence, parallel, and choice relations
    const entropy = computeFootprintEntropy(fp);
    expect(entropy).toBeGreaterThan(0);
  });
});

describe('formatFootprints', () => {
  it('should format footprint as readable matrix', () => {
    const fp = createSequentialFootprint();
    const formatted = formatFootprints(fp);
    expect(formatted).toContain('Footprint Matrix');
    expect(formatted).toContain('A');
    expect(formatted).toContain('B');
    expect(formatted).toContain('C');
  });
});

describe('formatFootprintComparison', () => {
  it('should format equivalent comparison', () => {
    const comparison = compareFootprints(createSequentialFootprint(), createSequentialFootprint());
    const formatted = formatFootprintComparison(comparison);
    expect(formatted).toContain('EQUIVALENT');
  });
});
