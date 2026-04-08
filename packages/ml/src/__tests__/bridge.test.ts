import { describe, it, expect } from 'vitest';
import { buildFeatureMatrix, encodeLabels } from '../bridge.js';

describe('buildFeatureMatrix', () => {
  it('handles empty input', () => {
    const result = buildFeatureMatrix([]);
    expect(result.data).toEqual([]);
    expect(result.featureNames).toEqual([]);
    expect(result.caseIds).toEqual([]);
    expect(result.targets).toEqual([]);
    expect(result.labels).toEqual([]);
  });

  it('extracts numeric features', () => {
    const features = [
      { case_id: 'c1', trace_length: 5, elapsed_time: 1000 },
      { case_id: 'c2', trace_length: 3, elapsed_time: 500 },
    ];
    const result = buildFeatureMatrix(features);
    expect(result.data).toEqual([
      [5, 1000],
      [3, 500],
    ]);
    expect(result.featureNames).toEqual(['trace_length', 'elapsed_time']);
    expect(result.caseIds).toEqual(['c1', 'c2']);
  });

  it('one-hot encodes string features', () => {
    const features = [
      { case_id: 'c1', last_activity: 'A', trace_length: 5 },
      { case_id: 'c2', last_activity: 'B', trace_length: 3 },
      { case_id: 'c3', last_activity: 'A', trace_length: 4 },
    ];
    const result = buildFeatureMatrix(features);
    // Numeric first, then one-hot sorted alphabetically
    expect(result.featureNames).toContain('trace_length');
    expect(result.featureNames).toContain('last_activity=A');
    expect(result.featureNames).toContain('last_activity=B');
    expect(result.data[0][result.featureNames.indexOf('last_activity=A')]).toBe(1);
    expect(result.data[0][result.featureNames.indexOf('last_activity=B')]).toBe(0);
    expect(result.data[1][result.featureNames.indexOf('last_activity=A')]).toBe(0);
    expect(result.data[1][result.featureNames.indexOf('last_activity=B')]).toBe(1);
  });

  it('extracts numeric target', () => {
    const features = [
      { case_id: 'c1', trace_length: 5, remaining_time: 200 },
      { case_id: 'c2', trace_length: 3, remaining_time: 100 },
    ];
    const result = buildFeatureMatrix(features, 'remaining_time');
    expect(result.targets).toEqual([200, 100]);
    expect(result.featureNames).toEqual(['trace_length']); // remaining_time excluded
  });

  it('extracts categorical target', () => {
    const features = [
      { case_id: 'c1', trace_length: 5, outcome: 'Approve' },
      { case_id: 'c2', trace_length: 3, outcome: 'Reject' },
    ];
    const result = buildFeatureMatrix(features, undefined, 'outcome');
    expect(result.labels).toEqual(['Approve', 'Reject']);
    expect(result.featureNames).toEqual(['trace_length']); // outcome excluded
  });
});

describe('encodeLabels', () => {
  it('encodes string labels to numeric indices', () => {
    const result = encodeLabels(['B', 'A', 'B', 'C', 'A']);
    expect(result.encoded).toEqual([1, 0, 1, 2, 0]);
    expect(result.labelMap.get('A')).toBe(0);
    expect(result.labelMap.get('B')).toBe(1);
    expect(result.labelMap.get('C')).toBe(2);
    expect(result.reverseMap.get(0)).toBe('A');
    expect(result.reverseMap.get(1)).toBe('B');
    expect(result.reverseMap.get(2)).toBe('C');
  });

  it('handles single label', () => {
    const result = encodeLabels(['X', 'X']);
    expect(result.encoded).toEqual([0, 0]);
    expect(result.reverseMap.size).toBe(1);
  });
});
