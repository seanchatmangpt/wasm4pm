import { describe, expect, it } from 'vitest';
import { resolveChainRef, splitChainSegments } from '../chain.js';

describe('splitChainSegments', () => {
  it('splits argv into per-step segments on the literal ++ token', () => {
    const segments = splitChainSegments(['calc', 'square', '4', '++', 'calc', 'add', '@{1.result}', '10']);
    expect(segments).toEqual([
      ['calc', 'square', '4'],
      ['calc', 'add', '@{1.result}', '10'],
    ]);
  });

  it('returns a single segment when there is no ++ token', () => {
    expect(splitChainSegments(['calc', 'add', '2', '3'])).toEqual([['calc', 'add', '2', '3']]);
  });

  it('supports more than two chained steps', () => {
    const segments = splitChainSegments(['a', 'b', '++', 'c', 'd', '++', 'e', 'f']);
    expect(segments).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });
});

describe('resolveChainRef', () => {
  const priorResults = [{ operation: 'square', value: 4, result: 16 }];

  it('passes non-reference tokens through unchanged', () => {
    expect(resolveChainRef('10', priorResults)).toBe('10');
    expect(resolveChainRef('--flag', priorResults)).toBe('--flag');
  });

  it('extracts a scalar field from a prior step result as a string', () => {
    expect(resolveChainRef('@{1.result}', priorResults)).toBe('16');
  });

  it('extracts a nested field via a dotted path', () => {
    const nested = [{ model: { path: '/tmp/model.json', stats: { fitness: 0.97 } } }];
    expect(resolveChainRef('@{1.model.path}', nested)).toBe('/tmp/model.json');
    expect(resolveChainRef('@{1.model.stats.fitness}', nested)).toBe('0.97');
  });

  it('JSON-encodes a non-scalar extracted value', () => {
    const nested = [{ model: { path: '/tmp/model.json' } }];
    expect(resolveChainRef('@{1.model}', nested)).toBe(JSON.stringify({ path: '/tmp/model.json' }));
  });

  it('throws a structured error for a step number that has not run yet', () => {
    expect(() => resolveChainRef('@{2.result}', priorResults)).toThrow(/step 2/);
  });

  it('throws a structured error for a missing path', () => {
    expect(() => resolveChainRef('@{1.nope}', priorResults)).toThrow(/not found in step 1/);
  });
});
