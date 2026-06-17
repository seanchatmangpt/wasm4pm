//! Track C2 — process quality science layer tests
//!
//! Tests for:
//!   - BROKEN_LOGICAL_CLOCK finding type (trace law violations)
//!   - RECEIPT_FORGERY finding type (causal consistency violations)
//!   - Adversarial catalogue entries for new finding types

import { describe, it, expect } from 'vitest';
import { ADVERSARIAL_DETECTORS, getAdversarialCatalogue } from '../adversarial/catalogue.js';
import { verifyCausalConsistency } from '../receipt/chain.js';

// ---------------------------------------------------------------------------
// Adversarial catalogue — new finding types registered
// ---------------------------------------------------------------------------

describe('adversarial catalogue — Track C2 finding types', () => {
  it('BROKEN_LOGICAL_CLOCK is registered', () => {
    const entry = ADVERSARIAL_DETECTORS.find((d) => d.code === 'BROKEN_LOGICAL_CLOCK');
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe('fatal');
  });

  it('RECEIPT_FORGERY is registered', () => {
    const entry = ADVERSARIAL_DETECTORS.find((d) => d.code === 'RECEIPT_FORGERY');
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe('fatal');
  });

  it('getAdversarialCatalogue returns both new codes', () => {
    const codes = getAdversarialCatalogue().map((d) => d.code);
    expect(codes).toContain('BROKEN_LOGICAL_CLOCK');
    expect(codes).toContain('RECEIPT_FORGERY');
  });
});

// ---------------------------------------------------------------------------
// verifyCausalConsistency — replay_pointer check
// ---------------------------------------------------------------------------

describe('verifyCausalConsistency — replay_pointer law', () => {
  // We need a valid run_id. Since blake3 may or may not be available in test
  // env, we only test the replay_pointer law here (independent of hash algo).

  it('passes when replay_pointer equals output_hash[:16]', () => {
    const output_hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const breed = 'prolog';
    // For test purposes, bypass run_id check by supplying the "correct" run_id
    // by calling the same internal logic. We only test replay_pointer isolation.
    const result = verifyCausalConsistency({
      // run_id will fail unless it matches blake3(breed|output_hash)
      // So we supply a dummy but check violations list for the specific violation.
      run_id: 'dummy-run-id',
      breed,
      output_hash,
      replay_pointer: output_hash.slice(0, 16), // correct
    });
    // Only run_id violation should appear (replay_pointer is correct)
    const replayViolation = result.violations.filter((v) => v.includes('replay_pointer'));
    expect(replayViolation).toHaveLength(0);
  });

  it('flags RECEIPT_FORGERY when replay_pointer is wrong', () => {
    const output_hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const result = verifyCausalConsistency({
      run_id: 'dummy',
      breed: 'prolog',
      output_hash,
      replay_pointer: 'wrongpointer0000', // wrong
    });
    const replayViolation = result.violations.find((v) => v.includes('replay_pointer'));
    expect(replayViolation).toBeDefined();
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyCausalConsistency — orphan detection
// ---------------------------------------------------------------------------

describe('verifyCausalConsistency — orphan detection', () => {
  it('flags RECEIPT_FORGERY when run_id not in OCEL corpus', () => {
    const output_hash = 'a'.repeat(64);
    const corpusIds = new Set(['known-run-id-1', 'known-run-id-2']);
    const result = verifyCausalConsistency(
      {
        run_id: 'unknown-run-id',
        breed: 'prolog',
        output_hash,
        replay_pointer: output_hash.slice(0, 16),
      },
      corpusIds,
    );
    const orphanViolation = result.violations.find((v) => v.includes('orphan'));
    expect(orphanViolation).toBeDefined();
    expect(result.ok).toBe(false);
  });

  it('passes orphan check when run_id is in OCEL corpus', () => {
    const output_hash = 'b'.repeat(64);
    const corpusIds = new Set(['known-run-id-1']);
    const result = verifyCausalConsistency(
      {
        run_id: 'known-run-id-1',
        breed: 'prolog',
        output_hash,
        replay_pointer: output_hash.slice(0, 16),
      },
      corpusIds,
    );
    const orphanViolation = result.violations.find((v) => v.includes('orphan'));
    expect(orphanViolation).toBeUndefined();
  });

  it('skips orphan check when no corpus supplied', () => {
    const output_hash = 'c'.repeat(64);
    const result = verifyCausalConsistency({
      run_id: 'any-run-id',
      breed: 'prolog',
      output_hash,
      replay_pointer: output_hash.slice(0, 16),
    });
    const orphanViolation = result.violations.find((v) => v.includes('orphan'));
    expect(orphanViolation).toBeUndefined();
  });
});
