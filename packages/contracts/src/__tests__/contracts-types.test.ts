/**
 * contracts-types.test.ts
 *
 * Tests for the new additions to @wasm4pm/contracts:
 *   result.ts  — isPartialFailure, hasError, mapResult
 *   receipt.ts — validateReceiptSchema, isReceiptExpired, receiptSummary, compareReceipts
 *   errors.ts  — ProcessMiningErrors factories
 */

import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  error,
  isOk,
  isPartialFailure,
  hasError,
  mapResult,
  unwrapOr,
} from '../result.js';
import {
  validateReceiptSchema,
  isReceiptExpired,
  receiptSummary,
  compareReceipts,
} from '../receipt.js';
import { ProcessMiningErrors, createError } from '../errors.js';
import type { Receipt } from '../receipt.js';
import type { Result } from '../result.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeValidReceipt(overrides: Partial<Receipt> = {}): Receipt {
  const now = new Date().toISOString();
  return {
    run_id: '550e8400-e29b-41d4-a716-446655440000',
    schema_version: '1.0',
    config_hash: 'a'.repeat(64),
    input_hash: 'b'.repeat(64),
    plan_hash: 'c'.repeat(64),
    output_hash: 'd'.repeat(64),
    start_time: now,
    end_time: now,
    duration_ms: 42,
    status: 'success',
    summary: { traces_processed: 100, objects_processed: 50, variants_discovered: 8 },
    algorithm: { name: 'dfg', version: '1.0.0', parameters: {} },
    model: { nodes: 5, edges: 12 },
    ...overrides,
  };
}

// ── isPartialFailure ──────────────────────────────────────────────────────────

describe('isPartialFailure()', () => {
  it('returns false for an ok result', () => {
    expect(isPartialFailure(ok(42))).toBe(false);
  });

  it('returns false for a simple string err result', () => {
    expect(isPartialFailure(err('boom'))).toBe(false);
  });

  it('returns false for a non-recoverable structured error', () => {
    const e = error(createError('SOURCE_NOT_FOUND', 'missing'));
    // SOURCE_NOT_FOUND.recoverable === false
    expect(isPartialFailure(e)).toBe(false);
  });

  it('returns true for a recoverable structured error', () => {
    const e = error(createError('ALGORITHM_FAILED', 'partial run'));
    // ALGORITHM_FAILED.recoverable === true
    expect(isPartialFailure(e)).toBe(true);
  });

  it('returns true for CONFORMANCE_FAILED (recoverable)', () => {
    const e = error(createError('CONFORMANCE_FAILED', 'fitness too low'));
    expect(isPartialFailure(e)).toBe(true);
  });
});

// ── hasError ──────────────────────────────────────────────────────────────────

describe('hasError()', () => {
  it('returns false for ok result', () => {
    expect(hasError(ok('hello'))).toBe(false);
  });

  it('returns false for simple string err result', () => {
    expect(hasError(err('oops'))).toBe(false);
  });

  it('returns true for structured error result', () => {
    const r = error(createError('WASM_INIT_FAILED', 'binary missing'));
    expect(hasError(r)).toBe(true);
  });

  it('is a type guard — after check, result.error is ErrorInfo', () => {
    const r: Result<string> = error(createError('CONFIG_MISSING', 'no config'));
    if (hasError(r)) {
      // TypeScript narrows r to ErrorResult here
      expect(r.error.code).toBe('CONFIG_MISSING');
      expect(typeof r.error.remediation).toBe('string');
    }
  });
});

// ── unwrapOr ──────────────────────────────────────────────────────────────────

describe('unwrapOr()', () => {
  it('returns the success value for an ok result', () => {
    expect(unwrapOr(ok(99), 0)).toBe(99);
  });

  it('returns fallback when result is simple string err', () => {
    expect(unwrapOr(err('oops'), -1)).toBe(-1);
  });

  it('returns fallback when result is structured ErrorResult', () => {
    const r = error(createError('SOURCE_INVALID', 'bad xes'));
    expect(unwrapOr(r, 'default')).toBe('default');
  });
});

// ── mapResult ─────────────────────────────────────────────────────────────────

describe('mapResult()', () => {
  it('transforms the value of an ok result', () => {
    const r = ok(21);
    const mapped = mapResult(r, (x) => x * 2);
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) expect(mapped.value).toBe(42);
  });

  it('passes a simple string err through unchanged', () => {
    const r = err('boom');
    const mapped = mapResult(r, (x: number) => x * 2);
    expect(mapped.type).toBe('err');
  });

  it('passes a structured ErrorResult through unchanged', () => {
    const r = error(createError('ALGORITHM_FAILED', 'test'));
    const mapped = mapResult(r, (x: number) => x * 2);
    expect(mapped.type).toBe('error');
    if (hasError(mapped)) {
      expect(mapped.error.code).toBe('ALGORITHM_FAILED');
    }
  });

  it('supports type change (T → U)', () => {
    const r: Result<number> = ok(5);
    const mapped: Result<string> = mapResult(r, (n) => `value=${n}`);
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) expect(mapped.value).toBe('value=5');
  });
});

// ── validateReceiptSchema ─────────────────────────────────────────────────────

describe('validateReceiptSchema()', () => {
  it('accepts a fully valid receipt', () => {
    expect(validateReceiptSchema(makeValidReceipt())).toBe(true);
  });

  it('rejects null', () => {
    expect(validateReceiptSchema(null)).toBe(false);
  });

  it('rejects a plain object missing required fields', () => {
    expect(validateReceiptSchema({ run_id: 'x' })).toBe(false);
  });

  it('rejects a receipt with short hash fields (< 64 hex chars)', () => {
    const r = makeValidReceipt({ config_hash: 'abc' });
    expect(validateReceiptSchema(r)).toBe(false);
  });

  it('rejects a receipt with non-hex characters in hash fields', () => {
    const r = makeValidReceipt({ input_hash: 'z'.repeat(64) });
    expect(validateReceiptSchema(r)).toBe(false);
  });

  it('rejects a receipt with an unparseable start_time', () => {
    const r = makeValidReceipt({ start_time: 'not-a-date' });
    expect(validateReceiptSchema(r)).toBe(false);
  });

  it('rejects a receipt with negative duration_ms', () => {
    const r = makeValidReceipt({ duration_ms: -1 });
    expect(validateReceiptSchema(r)).toBe(false);
  });

  it('rejects a receipt with non-integer traces_processed', () => {
    const r = makeValidReceipt({
      summary: { traces_processed: 1.5, objects_processed: 0, variants_discovered: 0 },
    });
    expect(validateReceiptSchema(r)).toBe(false);
  });

  it('rejects a receipt with negative node count', () => {
    const r = makeValidReceipt({ model: { nodes: -1, edges: 5 } });
    expect(validateReceiptSchema(r)).toBe(false);
  });
});

// ── isReceiptExpired ──────────────────────────────────────────────────────────

describe('isReceiptExpired()', () => {
  it('returns false when the receipt is recent (within maxAgeMs)', () => {
    const r = makeValidReceipt({ end_time: new Date().toISOString() });
    expect(isReceiptExpired(r, 60_000)).toBe(false);
  });

  it('returns true when the receipt is older than maxAgeMs', () => {
    const old = new Date(Date.now() - 3_600_000).toISOString(); // 1 hour ago
    const r = makeValidReceipt({ end_time: old });
    expect(isReceiptExpired(r, 300_000)).toBe(true); // 5 min max age
  });

  it('returns true for an unparseable end_time (treat as expired)', () => {
    const r = makeValidReceipt({ end_time: 'bogus' });
    expect(isReceiptExpired(r, 60_000)).toBe(true);
  });

  it('returns false with maxAgeMs of Infinity', () => {
    const old = new Date(0).toISOString();
    const r = makeValidReceipt({ end_time: old });
    expect(isReceiptExpired(r, Infinity)).toBe(false);
  });
});

// ── receiptSummary ────────────────────────────────────────────────────────────

describe('receiptSummary()', () => {
  it('returns a non-empty string', () => {
    const r = makeValidReceipt();
    const s = receiptSummary(r);
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('includes the algorithm name', () => {
    const r = makeValidReceipt();
    expect(receiptSummary(r)).toContain('dfg');
  });

  it('includes the status', () => {
    const r = makeValidReceipt();
    expect(receiptSummary(r)).toMatch(/ok|success|partial|failed/);
  });

  it('includes trace count when traces_processed > 0', () => {
    const r = makeValidReceipt({ summary: { traces_processed: 342, objects_processed: 0, variants_discovered: 8 } });
    expect(receiptSummary(r)).toContain('342');
  });

  it('shows duration in ms for fast runs', () => {
    const r = makeValidReceipt({ duration_ms: 47 });
    expect(receiptSummary(r)).toContain('47ms');
  });

  it('shows duration in seconds for runs longer than 1000ms', () => {
    const r = makeValidReceipt({ duration_ms: 2500 });
    expect(receiptSummary(r)).toContain('2.5s');
  });
});

// ── compareReceipts ───────────────────────────────────────────────────────────

describe('compareReceipts()', () => {
  it('same: true when comparing identical receipts', () => {
    const r = makeValidReceipt();
    expect(compareReceipts(r, r).same).toBe(true);
  });

  it('detects differing run_id', () => {
    const a = makeValidReceipt({ run_id: '00000000-0000-0000-0000-000000000001' });
    const b = makeValidReceipt({ run_id: '00000000-0000-0000-0000-000000000002' });
    const diff = compareReceipts(a, b);
    expect(diff.same).toBe(false);
    expect(diff.run_id).toBeDefined();
    expect(diff.run_id?.a).toBe(a.run_id);
    expect(diff.run_id?.b).toBe(b.run_id);
  });

  it('detects differing status', () => {
    const a = makeValidReceipt({ status: 'success' });
    const b = makeValidReceipt({ status: 'failed' });
    const diff = compareReceipts(a, b);
    expect(diff.same).toBe(false);
    expect(diff.status).toEqual({ a: 'success', b: 'failed' });
  });

  it('detects differing algorithm name', () => {
    const a = makeValidReceipt({ algorithm: { name: 'dfg', version: '1.0', parameters: {} } });
    const b = makeValidReceipt({ algorithm: { name: 'heuristic_miner', version: '1.0', parameters: {} } });
    const diff = compareReceipts(a, b);
    expect(diff.same).toBe(false);
    expect(diff.algorithm).toBeDefined();
  });

  it('detects differing hash fields', () => {
    const a = makeValidReceipt({ input_hash: 'a'.repeat(64) });
    const b = makeValidReceipt({ input_hash: 'b'.repeat(64) });
    const diff = compareReceipts(a, b);
    expect(diff.same).toBe(false);
    expect(diff.hashes).toBeDefined();
    expect(diff.hashes?.some((h) => h.field === 'input_hash')).toBe(true);
  });

  it('detects differing summary counts', () => {
    const a = makeValidReceipt({ summary: { traces_processed: 100, objects_processed: 0, variants_discovered: 5 } });
    const b = makeValidReceipt({ summary: { traces_processed: 200, objects_processed: 0, variants_discovered: 5 } });
    const diff = compareReceipts(a, b);
    expect(diff.same).toBe(false);
    expect(diff.summary?.some((s) => s.field === 'traces_processed')).toBe(true);
  });

  it('detects differing model edge count', () => {
    const a = makeValidReceipt({ model: { nodes: 5, edges: 10 } });
    const b = makeValidReceipt({ model: { nodes: 5, edges: 20 } });
    const diff = compareReceipts(a, b);
    expect(diff.same).toBe(false);
    expect(diff.model?.some((m) => m.field === 'edges')).toBe(true);
  });

  it('ignores duration_ms differences within 1ms tolerance', () => {
    const a = makeValidReceipt({ duration_ms: 100 });
    const b = makeValidReceipt({ duration_ms: 100 }); // identical
    expect(compareReceipts(a, b).duration_ms).toBeUndefined();
  });

  it('flags duration_ms differences > 1ms', () => {
    const a = makeValidReceipt({ duration_ms: 100 });
    const b = makeValidReceipt({ duration_ms: 150 });
    const diff = compareReceipts(a, b);
    expect(diff.duration_ms).toEqual({ a: 100, b: 150 });
  });
});

// ── ProcessMiningErrors ───────────────────────────────────────────────────────

describe('ProcessMiningErrors', () => {
  it('invalidXes has code SOURCE_INVALID (exit 301)', () => {
    const e = ProcessMiningErrors.invalidXes('unexpected EOF');
    expect(e.code).toBe('SOURCE_INVALID');
    expect(e.exit_code).toBe(301);
    expect(e.message).toContain('Invalid XES');
    expect(e.message).toContain('unexpected EOF');
  });

  it('algorithmFailed has code ALGORITHM_FAILED (exit 400)', () => {
    const e = ProcessMiningErrors.algorithmFailed('dfg', 'out of memory');
    expect(e.code).toBe('ALGORITHM_FAILED');
    expect(e.exit_code).toBe(400);
    expect(e.message).toContain('dfg');
    expect(e.message).toContain('out of memory');
  });

  it('wasmLoadFailed has code WASM_INIT_FAILED (exit 500)', () => {
    const e = ProcessMiningErrors.wasmLoadFailed('binary not found');
    expect(e.code).toBe('WASM_INIT_FAILED');
    expect(e.exit_code).toBe(500);
    expect(e.message).toContain('binary not found');
  });

  it('conformanceFailed has code CONFORMANCE_FAILED (exit 450)', () => {
    const e = ProcessMiningErrors.conformanceFailed(0.72, 0.85);
    expect(e.code).toBe('CONFORMANCE_FAILED');
    expect(e.exit_code).toBe(450);
    expect(e.message).toContain('0.720');
    expect(e.message).toContain('0.850');
  });

  it('sourceNotFound has code SOURCE_NOT_FOUND (exit 300)', () => {
    const e = ProcessMiningErrors.sourceNotFound('/tmp/missing.xes');
    expect(e.code).toBe('SOURCE_NOT_FOUND');
    expect(e.exit_code).toBe(300);
    expect(e.message).toContain('/tmp/missing.xes');
  });

  it('algorithmNotFound has code ALGORITHM_NOT_FOUND (exit 401)', () => {
    const e = ProcessMiningErrors.algorithmNotFound('fake_algo');
    expect(e.code).toBe('ALGORITHM_NOT_FOUND');
    expect(e.exit_code).toBe(401);
    expect(e.message).toContain('fake_algo');
  });

  it('all factories include a non-empty remediation string', () => {
    const cases = [
      ProcessMiningErrors.invalidXes('x'),
      ProcessMiningErrors.algorithmFailed('dfg', 'y'),
      ProcessMiningErrors.wasmLoadFailed('z'),
      ProcessMiningErrors.conformanceFailed(0.5, 0.85),
      ProcessMiningErrors.sourceNotFound('/x'),
      ProcessMiningErrors.algorithmNotFound('bad'),
    ];
    for (const e of cases) {
      expect(typeof e.remediation).toBe('string');
      expect(e.remediation.length).toBeGreaterThan(0);
    }
  });

  it('context record contains the relevant fields for each factory', () => {
    const xes = ProcessMiningErrors.invalidXes('detail-value');
    expect(xes.context?.detail).toBe('detail-value');

    const conf = ProcessMiningErrors.conformanceFailed(0.7, 0.85);
    expect(conf.context?.fitness).toBe(0.7);
    expect(conf.context?.threshold).toBe(0.85);

    const algo = ProcessMiningErrors.algorithmFailed('dfg', 'reason-text');
    expect(algo.context?.algo).toBe('dfg');
    expect(algo.context?.reason).toBe('reason-text');
  });
});
