import { describe, it, expect } from 'vitest';
import { levenshteinDistance, findClosestMatch } from '@wasm4pm/contracts';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('dfg', 'dfg')).toBe(0);
  });

  it('returns edit distance for single character', () => {
    expect(levenshteinDistance('a', 'b')).toBe(1);
  });

  it('calculates insertion distance', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('calculates deletion distance', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('calculates substitution distance', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });
});

describe('findClosestMatch', () => {
  const candidates = ['dfg', 'heuristic_miner', 'genetic_algorithm', 'inductive_miner'];

  it('finds exact match', () => {
    expect(findClosestMatch('dfg', candidates)).toBe('dfg');
  });

  it('finds closest match within distance threshold', () => {
    expect(findClosestMatch('dfg_plus', candidates, 5)).toBe('dfg');
  });

  it('finds typo suggestion for heuristic_miner', () => {
    expect(findClosestMatch('heuristic_mine', candidates, 3)).toBe('heuristic_miner');
  });

  it('returns null for no match within threshold', () => {
    expect(findClosestMatch('xyz', candidates, 2)).toBeNull();
  });

  it('handles case-insensitive matching', () => {
    expect(findClosestMatch('DFG', candidates)).toBe('dfg');
  });

  it('uses default distance threshold of 3', () => {
    expect(findClosestMatch('genetci_algorithm', candidates)).toBe('genetic_algorithm');
  });

  it('returns null for distance exceeding threshold', () => {
    expect(findClosestMatch('completely_different', candidates, 2)).toBeNull();
  });
});
