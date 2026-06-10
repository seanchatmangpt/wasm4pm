/**
 * BVC — Breed Validation Certificate unit tests
 *
 * All tests use a synthetic ContractResult stub; no WASM boundary is crossed.
 */

import { describe, it, expect } from 'vitest';
import { computeBVC } from '../bvc.js';
import type { ContractResult } from '../types.js';

/** Minimal valid ContractResult for a corpus breed */
function makeResult(overrides: Partial<ContractResult> = {}): ContractResult {
  return {
    status: 'ok',
    breed: 'mycin',
    run_id: 'run-0001',
    input_hash: 'a'.repeat(64),
    output_hash: 'b'.repeat(64),
    replay_pointer: 'b'.repeat(16),
    options_profile: null,
    output: {
      breed: 'mycin',
      candidates: [],
      facts: [],
      selected: null,
      explanation: 'test',
    },
    ...overrides,
  } as ContractResult;
}

describe('computeBVC', () => {
  it('returns score=1.0 and certified=true for a fully valid mycin result', () => {
    const result = computeBVC(makeResult());

    expect(result.score).toBe(1.0);
    expect(result.certified).toBe(true);
    expect(result.failing).toHaveLength(0);
    expect(result.breed).toBe('mycin');
    expect(result.dimensions.c_test).toBe(1.0);
    expect(result.dimensions.c_ocel).toBe(1.0);
    expect(result.dimensions.c_receipt).toBe(1.0);
    expect(result.dimensions.c_determ).toBe(1.0);
  });

  it('returns score<1.0 when output_hash is empty (c_receipt failing)', () => {
    const result = computeBVC(makeResult({ output_hash: '' }));

    expect(result.score).toBeLessThan(1.0);
    expect(result.certified).toBe(false);
    expect(result.dimensions.c_receipt).toBe(0.0);
    // c_test, c_ocel, c_determ are still 1.0 for a corpus breed
    expect(result.score).toBeCloseTo(0.75);
  });

  it('returns score<1.0 for an unknown breed (c_test, c_ocel, c_determ all 0)', () => {
    const result = computeBVC(makeResult({ breed: 'unknown_breed' as never }));

    expect(result.certified).toBe(false);
    expect(result.dimensions.c_test).toBe(0.0);
    expect(result.dimensions.c_ocel).toBe(0.0);
    expect(result.dimensions.c_determ).toBe(0.0);
    // c_receipt is still 1.0 (output_hash is non-empty)
    expect(result.score).toBeCloseTo(0.25);
  });

  it('failing[] contains exactly the dimension names that are < 1.0', () => {
    // Unknown breed with non-empty hash → c_test, c_ocel, c_determ fail
    const result = computeBVC(makeResult({ breed: 'rogue' as never }));

    expect(result.failing).toContain('c_test');
    expect(result.failing).toContain('c_ocel');
    expect(result.failing).toContain('c_determ');
    expect(result.failing).not.toContain('c_receipt');
    expect(result.failing).toHaveLength(3);
  });
});
