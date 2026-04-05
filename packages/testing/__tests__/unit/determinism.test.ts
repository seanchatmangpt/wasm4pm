import { describe, it, expect } from 'vitest';
import {
  checkDeterminism,
  stableReceiptHash,
  receiptsMatch,
} from '../../src/harness/determinism.js';

describe('Determinism Harness', () => {
  const makeReceipt = (overrides?: Record<string, unknown>) => ({
    status: 'success',
    config_hash: 'abc123',
    input_hash: 'def456',
    plan_hash: 'ghi789',
    algorithm: 'dfg',
    event_count: 100,
    trace_count: 10,
    run_id: `run-${Math.random()}`,
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    duration_ms: Math.random() * 100,
    ...overrides,
  });

  describe('stableReceiptHash', () => {
    it('produces same hash for identical stable fields', () => {
      const r1 = makeReceipt();
      const r2 = makeReceipt();
      expect(stableReceiptHash(r1)).toBe(stableReceiptHash(r2));
    });

    it('ignores run_id differences', () => {
      const r1 = makeReceipt({ run_id: 'run-1' });
      const r2 = makeReceipt({ run_id: 'run-2' });
      expect(stableReceiptHash(r1)).toBe(stableReceiptHash(r2));
    });

    it('ignores timestamp differences', () => {
      const r1 = makeReceipt({ start_time: '2026-01-01T00:00:00Z' });
      const r2 = makeReceipt({ start_time: '2026-01-01T12:00:00Z' });
      expect(stableReceiptHash(r1)).toBe(stableReceiptHash(r2));
    });

    it('ignores duration_ms differences', () => {
      const r1 = makeReceipt({ duration_ms: 50 });
      const r2 = makeReceipt({ duration_ms: 150 });
      expect(stableReceiptHash(r1)).toBe(stableReceiptHash(r2));
    });

    it('differs for different stable fields', () => {
      const r1 = makeReceipt({ algorithm: 'dfg' });
      const r2 = makeReceipt({ algorithm: 'heuristic' });
      expect(stableReceiptHash(r1)).not.toBe(stableReceiptHash(r2));
    });

    it('differs for different config_hash', () => {
      const r1 = makeReceipt({ config_hash: 'hash1' });
      const r2 = makeReceipt({ config_hash: 'hash2' });
      expect(stableReceiptHash(r1)).not.toBe(stableReceiptHash(r2));
    });
  });

  describe('receiptsMatch', () => {
    it('matches identical receipts', () => {
      const r1 = makeReceipt();
      const r2 = makeReceipt();
      expect(receiptsMatch(r1, r2)).toBe(true);
    });

    it('does not match different stable fields', () => {
      const r1 = makeReceipt({ event_count: 100 });
      const r2 = makeReceipt({ event_count: 200 });
      expect(receiptsMatch(r1, r2)).toBe(false);
    });
  });

  describe('checkDeterminism', () => {
    it('passes for deterministic producer', async () => {
      const result = await checkDeterminism(() => Promise.resolve(makeReceipt()), 5);
      expect(result.passed).toBe(true);
      expect(result.iterations).toBe(5);
      expect(result.hashes.length).toBe(5);
      expect(result.details).toContain('Determinism verified');
    });

    it('fails for non-deterministic producer', async () => {
      let counter = 0;
      const result = await checkDeterminism(
        () => Promise.resolve(makeReceipt({ event_count: ++counter })),
        3,
      );
      expect(result.passed).toBe(false);
      expect(result.details).toContain('Non-deterministic');
    });

    it('identifies stable and unstable fields', async () => {
      const result = await checkDeterminism(() => Promise.resolve(makeReceipt()), 3);
      expect(result.stableFields).toContain('status');
      expect(result.stableFields).toContain('config_hash');
      expect(result.stableFields).toContain('algorithm');
      expect(result.unstableFields).toContain('run_id');
      expect(result.unstableFields).toContain('start_time');
      expect(result.unstableFields).toContain('duration_ms');
    });

    it('works with 1 iteration', async () => {
      const result = await checkDeterminism(() => Promise.resolve(makeReceipt()), 1);
      expect(result.passed).toBe(true);
      expect(result.iterations).toBe(1);
    });
  });
});
