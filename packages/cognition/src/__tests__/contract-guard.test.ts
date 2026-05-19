/**
 * contract-guard.test.ts — Rank-1 structural oracle for cognition WASM
 * output guards (no WASM binary needed; pure TS functions).
 *
 * Each test pins a specific drift mode named in
 * `.claude/rules/cognition-contracts.md` so the guard cannot silently
 * regress without a test going red.
 */

import { describe, it, expect } from 'vitest';
import {
  assertContractResult,
  assertReplayRecord,
  assertSystemBuildResult,
  assertSystemVerifyResult,
  assertVerifyResult,
} from '../contract/guard.js';
import { CognitionError } from '../errors.js';

const OUTPUT_HASH = 'a'.repeat(64);
const REPLAY_PTR = OUTPUT_HASH.slice(0, 16);
const OK = {
  status: 'ok',
  breed: 'eliza',
  run_id: 'b'.repeat(64),
  output_hash: OUTPUT_HASH,
  replay_pointer: REPLAY_PTR,
  options_profile: null,
  output: { breed: 'Eliza', candidates: [], facts: [], explanation: '' },
};

describe('assertContractResult', () => {
  it('accepts canonical Rust shape', () => {
    expect(() => assertContractResult(OK)).not.toThrow();
  });
  it('rejects null', () => {
    expect(() => assertContractResult(null)).toThrow(CognitionError);
  });
  it('rejects status drift', () => {
    expect(() => assertContractResult({ ...OK, status: 'rejected' })).toThrow(/status/);
  });
  it('rejects legacy `hash` field (Rust emits output_hash)', () => {
    const { output_hash: _d, ...rest } = OK;
    void _d;
    expect(() => assertContractResult({ ...rest, hash: OUTPUT_HASH })).toThrow(/output_hash/);
  });
  it('rejects replay_pointer not a 16-char prefix of output_hash', () => {
    expect(() =>
      assertContractResult({ ...OK, replay_pointer: 'z'.repeat(16) }),
    ).toThrow(/replay_pointer/);
  });
  it('rejects replay_pointer of wrong length', () => {
    expect(() =>
      assertContractResult({ ...OK, replay_pointer: REPLAY_PTR + 'a' }),
    ).toThrow(/replay_pointer/);
  });
  it('accepts string options_profile', () => {
    expect(() => assertContractResult({ ...OK, options_profile: 'fast' })).not.toThrow();
  });
  it('rejects options_profile of wrong type', () => {
    expect(() => assertContractResult({ ...OK, options_profile: 42 })).toThrow(
      /options_profile/,
    );
  });
  it('error code is OUTPUT_SHAPE_INVALID', () => {
    try {
      assertContractResult({ status: 'ok' });
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as CognitionError).code).toBe('OUTPUT_SHAPE_INVALID');
    }
  });
});

describe('assertVerifyResult', () => {
  it('accepts verified/has_findings', () => {
    expect(() => assertVerifyResult({ status: 'verified', findings: [] })).not.toThrow();
    expect(() =>
      assertVerifyResult({ status: 'has_findings', findings: [] }),
    ).not.toThrow();
  });
  it('rejects phantom status "rejected"', () => {
    expect(() => assertVerifyResult({ status: 'rejected', findings: [] })).toThrow(
      /status/,
    );
  });
  it('rejects missing findings', () => {
    expect(() => assertVerifyResult({ status: 'verified' })).toThrow(/findings/);
  });
});

describe('assertSystemBuildResult', () => {
  it('accepts pareto_front + dominated', () => {
    expect(() =>
      assertSystemBuildResult({ pareto_front: [], dominated: [] }),
    ).not.toThrow();
  });
  it('rejects legacy `candidates` field', () => {
    expect(() =>
      assertSystemBuildResult({ pareto_front: [], dominated: [], candidates: [] }),
    ).toThrow(/candidates/);
  });
});

describe('assertSystemVerifyResult', () => {
  it('accepts canonical verified', () => {
    expect(() =>
      assertSystemVerifyResult({ target: 's', status: 'verified', findings: [] }),
    ).not.toThrow();
  });
  it('tolerates legacy status: "ok"', () => {
    expect(() =>
      assertSystemVerifyResult({ target: 's', status: 'ok', findings: [] }),
    ).not.toThrow();
  });
  it('rejects missing target', () => {
    expect(() =>
      assertSystemVerifyResult({ status: 'verified', findings: [] }),
    ).toThrow(/target/);
  });
});

describe('assertReplayRecord', () => {
  it('accepts canonical', () => {
    expect(() =>
      assertReplayRecord({ run_id: 'r', output_hash: 'h', replay_pointer: 'p' }),
    ).not.toThrow();
  });
  it('rejects missing replay_pointer', () => {
    expect(() => assertReplayRecord({ run_id: 'r', output_hash: 'h' })).toThrow(
      /replay_pointer/,
    );
  });
});
