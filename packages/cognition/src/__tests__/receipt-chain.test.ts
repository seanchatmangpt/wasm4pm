/**
 * receipt-chain.test.ts — 6 tests for ReceiptChain
 *
 * Oracle rank: Rank 1 (Mathematical theorem — sequential hash invariant).
 *
 * All tests construct ReceiptChain objects directly.
 * No WASM, no I/O.
 */

import { describe, it, expect } from 'vitest';
import { ReceiptChain } from '../receipt/chain.js';
import type { ReceiptLink } from '../types.js';

function makeLink(
  index: number,
  combined_hash: string,
  prev_hash?: string
): ReceiptLink {
  return {
    index,
    input_hash: `in-${index}`,
    output_hash: `out-${index}`,
    combined_hash,
    prev_hash,
  };
}

describe('ReceiptChain', () => {
  it('empty chain: verifyChain() returns true', () => {
    const chain = new ReceiptChain();
    expect(chain.verifyChain()).toBe(true);
  });

  it('empty chain: replayPointer() returns "empty"', () => {
    const chain = new ReceiptChain();
    expect(chain.replayPointer()).toBe('empty');
  });

  it('single-link chain: verifyChain() returns true (no predecessor to check)', () => {
    const chain = new ReceiptChain();
    chain.links = [makeLink(0, 'hash-0')];
    expect(chain.verifyChain()).toBe(true);
  });

  it('two-link chain with matching prev_hash: verifyChain() returns true', () => {
    const chain = new ReceiptChain();
    chain.links = [
      makeLink(0, 'hash-0'),
      makeLink(1, 'hash-1', 'hash-0'),
    ];
    expect(chain.verifyChain()).toBe(true);
  });

  it('two-link chain with tampered prev_hash: verifyChain() returns false', () => {
    const chain = new ReceiptChain();
    chain.links = [
      makeLink(0, 'hash-0'),
      makeLink(1, 'hash-1', 'hash-TAMPERED'),
    ];
    expect(chain.verifyChain()).toBe(false);
  });

  it('replayPointer() returns combined_hash of the last link', () => {
    const chain = new ReceiptChain();
    chain.links = [
      makeLink(0, 'hash-0'),
      makeLink(1, 'hash-1', 'hash-0'),
      makeLink(2, 'hash-2', 'hash-1'),
    ];
    expect(chain.replayPointer()).toBe('hash-2');
  });
});
