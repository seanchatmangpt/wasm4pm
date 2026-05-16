/**
 * chain-show-guards.unit.test.ts — Rank-1 tests for receipt-chain integrity
 * and `cognition_show` field-contract drift detection.
 *
 * Companion to PR #44 (contract/guard.ts). Targets two surfaces PR #44 did
 * not cover:
 *   1. `ReceiptChain.verifyChain()` — previously accepted forged links whose
 *      `prev_hash` and `combined_hash` were both `undefined` (undefined ===
 *      undefined). Also did not enforce monotonic `index`.
 *   2. `showCognition` — previously cast WASM output as `ShowReport` without
 *      validating that `.breeds` is an array of well-formed BreedDescriptor.
 *
 * `.unit.test.ts` suffix permits `vi.mock` per `.claude/hooks/test-purity.sh`.
 * Integration coverage of `cognition_show` lives in
 * `cognition-wasm.integration.test.ts` (no init.js mocking there).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ReceiptChain } from '../receipt/chain.js';
import type { ReceiptLink } from '../types.js';

// ── ReceiptChain.verifyChain integrity (no mocks needed — pure TS class) ─────

function link(
  index: number,
  combined_hash: string,
  prev_hash?: string,
): ReceiptLink {
  return {
    index,
    input_hash: `in-${index}`,
    output_hash: `out-${index}`,
    combined_hash,
    prev_hash,
  };
}

describe('ReceiptChain.verifyChain — strict integrity', () => {
  it('rejects undefined-vs-undefined match (the old false-positive)', () => {
    // Previous implementation: `prev_hash !== combined_hash` returned false
    // (i.e., "no mismatch") when both were undefined → forged link accepted.
    const chain = new ReceiptChain();
    chain.links = [
      { index: 0, input_hash: 'a', output_hash: 'b', combined_hash: '' },
      { index: 1, input_hash: 'c', output_hash: 'd', combined_hash: '' },
    ];
    const outcome = chain.verifyChainStrict();
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('missing_prev_hash');
    expect(outcome.at_index).toBe(1);
  });

  it('rejects missing prev_hash on a non-genesis link', () => {
    const chain = new ReceiptChain();
    chain.links = [link(0, 'h0'), { ...link(1, 'h1'), prev_hash: undefined }];
    expect(chain.verifyChain()).toBe(false);
    expect(chain.verifyChainStrict().reason).toBe('missing_prev_hash');
  });

  it('rejects non-monotonic index (skipped link or rewrite)', () => {
    const chain = new ReceiptChain();
    chain.links = [link(0, 'h0'), link(2, 'h2', 'h0')];
    const outcome = chain.verifyChainStrict();
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('non_monotonic_index');
    expect(outcome.at_index).toBe(1);
  });

  it('rejects genesis link carrying a prev_hash (no predecessor allowed)', () => {
    const chain = new ReceiptChain();
    chain.links = [link(0, 'h0', 'forged-prev')];
    const outcome = chain.verifyChainStrict();
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('genesis_has_prev_hash');
  });

  it('accepts a well-formed 3-link chain', () => {
    const chain = new ReceiptChain();
    chain.links = [link(0, 'h0'), link(1, 'h1', 'h0'), link(2, 'h2', 'h1')];
    expect(chain.verifyChainStrict().ok).toBe(true);
    expect(chain.verifyChain()).toBe(true);
  });
});

// ── showCognition guard (unit-only — mocks injected failure shapes) ──────────

const mockCognitionShow = vi.fn();
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn(() => ({
  cognition_run: vi.fn(),
  cognition_verify: vi.fn(),
  cognition_replay: vi.fn(),
  cognition_show: mockCognitionShow,
  system_build: vi.fn(),
  system_verify: vi.fn(),
}));

vi.mock('../init.js', () => ({
  WasmLoader: {
    getInstance: () => ({ init: mockInit, get: mockGet }),
    reset: vi.fn(),
  },
  getWasmLoader: () => ({ init: mockInit, get: mockGet }),
}));

const { showCognition } = await import('../contract/show.js');

afterEach(() => {
  mockCognitionShow.mockReset();
});

describe('showCognition — field-contract guard', () => {
  it('rejects WASM output missing .breeds array', async () => {
    mockCognitionShow.mockReturnValue(JSON.stringify({ wrong_field: [] }));
    await expect(showCognition()).rejects.toThrow(/breeds must be an array/);
  });

  it('rejects breed entry missing .id', async () => {
    mockCognitionShow.mockReturnValue(
      JSON.stringify({ breeds: [{ name: 'X', year: 1970 }] }),
    );
    await expect(showCognition()).rejects.toThrow(/breeds\[0\]\.id/);
  });

  it('rejects breed entry with non-numeric .year', async () => {
    mockCognitionShow.mockReturnValue(
      JSON.stringify({ breeds: [{ id: 'x', name: 'X', year: 'not-a-number' }] }),
    );
    await expect(showCognition()).rejects.toThrow(/breeds\[0\]\.year/);
  });

  it('accepts well-formed catalogue mirroring wasm.rs:128-144', async () => {
    mockCognitionShow.mockReturnValue(
      JSON.stringify({
        breeds: [{ id: 'eliza', name: 'ELIZA', year: 1966 }],
      }),
    );
    const out = await showCognition();
    expect(out.breeds).toHaveLength(1);
    expect(out.breeds[0]).toEqual({ id: 'eliza', name: 'ELIZA', year: 1966 });
  });
});
