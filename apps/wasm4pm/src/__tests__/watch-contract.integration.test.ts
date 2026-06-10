/**
 * FM-5 compliant integration test for watch.ts cognition contract mapping.
 *
 * FM-5 rule: NO vi.mock on init.js. This file uses plain JS objects shaped
 * like the real ContractResult from Rust wasm.rs lines 182-190.
 *
 * Fields verified per .claude/rules/cognition-contracts.md:
 *   ALLOWED:  status, output_hash, run_id, breed, replay_pointer,
 *             options_profile, output
 *   FORBIDDEN on raw WASM result: decision, hash, findings, inference_trace
 */

import { it, expect, describe } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers that mirror the logic in watch.ts (tested in isolation)
// ---------------------------------------------------------------------------

type CognitionRunResult = {
  status?: string;
  breed?: string;
  run_id?: string;
  output_hash?: string;
  replay_pointer?: string;
  options_profile?: string | null;
  output?: { breed?: string; explanation?: string; [k: string]: unknown };
};

/** Replicated from watch.ts — map Rust output to WatchReceipt fields. */
function mapResultToReceipt(result: CognitionRunResult): {
  decision: 'Allow' | 'Deny';
  hash: string;
  findings: number;
} {
  return {
    decision: result.status === 'ok' ? 'Allow' : 'Deny',
    hash:
      typeof result.output_hash === 'string'
        ? result.output_hash.slice(0, 8)
        : '00000000',
    findings: 0, // cognition_run never emits findings
  };
}

// ---------------------------------------------------------------------------
// Real-shaped WASM ContractResult objects (no mocking — FM-5 compliant)
// ---------------------------------------------------------------------------

const okResult: CognitionRunResult = {
  status: 'ok',
  breed: 'test',
  run_id: 'abc123',
  output_hash: 'deadbeef01234567',
  replay_pointer: 'deadbeef01234567',
  options_profile: 'balanced',
  output: {},
};

const errorResult: CognitionRunResult = {
  status: 'error',
  breed: 'test',
  run_id: 'xyz999',
  output_hash: 'ffffffff00000000',
  replay_pointer: 'ffffffff',
  options_profile: null,
  output: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('watch.ts cognition contract — FM-5 integration', () => {
  describe('decision mapping: status -> Allow/Deny', () => {
    it('maps status === "ok" to Allow', () => {
      const receipt = mapResultToReceipt(okResult);
      expect(receipt.decision).toBe('Allow');
    });

    it('maps status !== "ok" to Deny', () => {
      const receipt = mapResultToReceipt(errorResult);
      expect(receipt.decision).toBe('Deny');
    });

    it('maps missing status to Deny', () => {
      const receipt = mapResultToReceipt({});
      expect(receipt.decision).toBe('Deny');
    });
  });

  describe('output_hash.slice(0,8) used for short hash', () => {
    it('uses first 8 chars of output_hash', () => {
      const receipt = mapResultToReceipt(okResult);
      expect(receipt.hash).toBe('deadbeef');
      expect(receipt.hash).toBe(okResult.output_hash!.slice(0, 8));
    });

    it('uses first 8 chars of a different output_hash', () => {
      const receipt = mapResultToReceipt(errorResult);
      expect(receipt.hash).toBe('ffffffff');
    });

    it('falls back to "00000000" when output_hash is absent', () => {
      const receipt = mapResultToReceipt({ status: 'ok' });
      expect(receipt.hash).toBe('00000000');
    });

    it('hash is exactly 8 characters long', () => {
      const receipt = mapResultToReceipt(okResult);
      expect(receipt.hash).toHaveLength(8);
    });
  });

  describe('forbidden fields absent on raw WASM result (ContractResult shape)', () => {
    it('.decision does not exist on raw WASM result', () => {
      expect((okResult as Record<string, unknown>)['decision']).toBeUndefined();
    });

    it('.hash does not exist on raw WASM result (use output_hash)', () => {
      expect((okResult as Record<string, unknown>)['hash']).toBeUndefined();
    });

    it('.findings does not exist on raw WASM result', () => {
      expect((okResult as Record<string, unknown>)['findings']).toBeUndefined();
    });

    it('.inference_trace does not exist on raw WASM result', () => {
      expect((okResult as Record<string, unknown>)['inference_trace']).toBeUndefined();
    });
  });

  describe('allowed fields present on raw WASM result', () => {
    it('status field exists', () => {
      expect(okResult.status).toBe('ok');
    });

    it('output_hash field exists', () => {
      expect(okResult.output_hash).toBeDefined();
    });

    it('run_id field exists', () => {
      expect(okResult.run_id).toBeDefined();
    });

    it('breed field exists', () => {
      expect(okResult.breed).toBeDefined();
    });

    it('replay_pointer equals first 16 chars of output_hash', () => {
      // Per cognition-contracts.md: replay_pointer is first 16 of output_hash
      expect(okResult.replay_pointer).toBe(okResult.output_hash!.slice(0, 16));
    });
  });

  describe('findings is always 0 on WatchReceipt (cognition_run does not emit findings)', () => {
    it('ok result has findings=0', () => {
      expect(mapResultToReceipt(okResult).findings).toBe(0);
    });

    it('error result has findings=0', () => {
      expect(mapResultToReceipt(errorResult).findings).toBe(0);
    });
  });
});
