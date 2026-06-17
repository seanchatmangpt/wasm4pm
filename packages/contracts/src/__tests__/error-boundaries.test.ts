/**
 * Error-boundary tests for @wasm4pm/contracts
 *
 * Covers functions that have ZERO test coverage in the existing test suite:
 *   - TypedError: createTypedError, resolveErrorCode, isTypedError, TYPED_ERROR_CODES, TYPED_ERROR_NAMES
 *   - ResultEnvelope: deriveLatencyClass, isResultEnvelope, isProvenanceChain (extended)
 *   - Receipt: isReceipt edge cases
 *
 * Does NOT duplicate tests that already exist in errors.test.ts or result.test.ts.
 */

import { describe, it, expect } from 'vitest';

import {
  createTypedError,
  resolveErrorCode,
  isTypedError,
  TYPED_ERROR_CODES,
  TYPED_ERROR_NAMES,
  type ErrorCode,
} from '../errors.js';

import {
  deriveLatencyClass,
  isResultEnvelope,
  isProvenanceChain,
  type ProvenanceChain,
} from '../result.js';

import { isReceipt, type Receipt } from '../receipt.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal valid ProvenanceChain (all 10 required fields present and non-empty) */
const VALID_PROV: ProvenanceChain = {
  input_hash: 'a'.repeat(64),
  config_hash: 'b'.repeat(64),
  plan_hash: 'c'.repeat(64),
  output_hash: 'd'.repeat(64),
  combined_hash: 'e'.repeat(64),
  algorithm_id: 'dfg',
  algorithm_version: '1.0.0',
  backend_id: 'wasm',
  kernel_version: '26.5.17',
  wasm_build_hash: 'f'.repeat(64),
};

/** Minimal valid ResultEnvelope for isResultEnvelope tests */
function makeEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: 'run-abc',
    invocation_id: 'inv-xyz',
    status: 'success',
    payload: { nodes: 5, edges: 8 },
    latency_ms: 42,
    latency_class: 'low_ms', // must match deriveLatencyClass(42)
    backend_id: 'wasm',
    algorithm_id: 'dfg',
    cycle_seq: 1,
    provenance: VALID_PROV,
    ...overrides,
  };
}

/** Minimal valid Receipt */
function makeReceipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: 'run-abc',
    schema_version: '1.1',
    trace_id: 'a'.repeat(32),
    config_hash: 'a'.repeat(64),
    input_hash: 'b'.repeat(64),
    plan_hash: 'c'.repeat(64),
    output_hash: 'd'.repeat(64),
    start_time: '2026-05-17T10:00:00.000Z',
    end_time: '2026-05-17T10:00:05.000Z',
    duration_ms: 5000,
    status: 'success',
    summary: { traces_processed: 42, objects_processed: 100, variants_discovered: 7 },
    algorithm: { name: 'dfg', version: '1.0.0', parameters: {} },
    model: { nodes: 5, edges: 8 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TypedError — createTypedError
// ---------------------------------------------------------------------------

describe('createTypedError', () => {
  it('creates a TypedError with schema_version 1.0', () => {
    const e = createTypedError('CONFIG_INVALID', 'bad config');
    expect(e.schema_version).toBe('1.0');
  });

  it('numeric code matches TYPED_ERROR_CODES mapping', () => {
    const e = createTypedError('SOURCE_NOT_FOUND', 'file missing');
    expect(e.code).toBe(TYPED_ERROR_CODES.SOURCE_NOT_FOUND);
  });

  it('message is preserved verbatim', () => {
    const msg = 'the XES log at /data/log.xes was not found';
    const e = createTypedError('SOURCE_NOT_FOUND', msg);
    expect(e.message).toBe(msg);
  });

  it('remediation string is non-empty', () => {
    const e = createTypedError('WASM_INIT_FAILED', 'WASM failed');
    expect(typeof e.remediation).toBe('string');
    expect(e.remediation.length).toBeGreaterThan(0);
  });

  it('default context is empty object', () => {
    const e = createTypedError('SINK_FAILED', 'write failed');
    expect(e.context).toEqual({});
  });

  it('custom context is preserved', () => {
    const ctx = { path: '/out', attempted: 3 };
    const e = createTypedError('SINK_FAILED', 'write failed', ctx);
    expect(e.context).toEqual(ctx);
  });

  it('code is in the 0-255 range for every ErrorCode', () => {
    const codes: ErrorCode[] = [
      'CONFIG_INVALID',
      'CONFIG_MISSING',
      'SOURCE_NOT_FOUND',
      'SOURCE_INVALID',
      'SOURCE_PERMISSION',
      'ALGORITHM_FAILED',
      'ALGORITHM_NOT_FOUND',
      'CONFORMANCE_FAILED',
      'SIMULATION_FAILED',
      'PREDICTION_FAILED',
      'VALIDATION_FAILED',
      'IMPORT_FAILED',
      'WASM_INIT_FAILED',
      'WASM_MEMORY_EXCEEDED',
      'SINK_FAILED',
      'SINK_PERMISSION',
      'OTEL_FAILED',
    ];
    for (const code of codes) {
      const e = createTypedError(code, 'test');
      expect(e.code, code).toBeGreaterThanOrEqual(0);
      expect(e.code, code).toBeLessThanOrEqual(255);
    }
  });
});

// ---------------------------------------------------------------------------
// TypedError — TYPED_ERROR_CODES mapping completeness
// ---------------------------------------------------------------------------

describe('TYPED_ERROR_CODES', () => {
  it('all codes are unique integers', () => {
    const values = Object.values(TYPED_ERROR_CODES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all codes are in 0-255 range', () => {
    for (const [name, code] of Object.entries(TYPED_ERROR_CODES)) {
      expect(code, name).toBeGreaterThanOrEqual(0);
      expect(code, name).toBeLessThanOrEqual(255);
    }
  });

  it('TYPED_ERROR_NAMES is the exact inverse of TYPED_ERROR_CODES', () => {
    for (const [name, code] of Object.entries(TYPED_ERROR_CODES)) {
      expect(TYPED_ERROR_NAMES[code]).toBe(name);
    }
  });
});

// ---------------------------------------------------------------------------
// TypedError — resolveErrorCode
// ---------------------------------------------------------------------------

describe('resolveErrorCode', () => {
  it('resolves a known code back to the ErrorCode string', () => {
    const e = createTypedError('ALGORITHM_FAILED', 'failed');
    const name = resolveErrorCode(e);
    expect(name).toBe('ALGORITHM_FAILED');
  });

  it('resolves every code created by createTypedError', () => {
    const codes: ErrorCode[] = ['CONFIG_INVALID', 'SOURCE_NOT_FOUND', 'WASM_INIT_FAILED', 'OTEL_FAILED'];
    for (const code of codes) {
      const e = createTypedError(code, 'test');
      expect(resolveErrorCode(e)).toBe(code);
    }
  });

  it('returns undefined for an unknown numeric code', () => {
    const unknown = { schema_version: '1.0' as const, code: 255, message: 'x', remediation: 'y', context: {} };
    // 255 is not a registered code
    expect(resolveErrorCode(unknown)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TypedError — isTypedError
// ---------------------------------------------------------------------------

describe('isTypedError', () => {
  it('returns true for a valid TypedError', () => {
    const e = createTypedError('CONFIG_MISSING', 'missing');
    expect(isTypedError(e)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isTypedError(null)).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isTypedError('error string')).toBe(false);
  });

  it('returns false when schema_version is wrong', () => {
    const bad = { ...createTypedError('CONFIG_MISSING', 'x'), schema_version: '2.0' };
    expect(isTypedError(bad)).toBe(false);
  });

  it('returns false when code is out of 0-255 range', () => {
    const bad = { schema_version: '1.0', code: 300, message: 'x', remediation: 'y', context: {} };
    expect(isTypedError(bad)).toBe(false);
  });

  it('returns false when code is negative', () => {
    const bad = { schema_version: '1.0', code: -1, message: 'x', remediation: 'y', context: {} };
    expect(isTypedError(bad)).toBe(false);
  });

  it('returns false when message is not a string', () => {
    const bad = { schema_version: '1.0', code: 10, message: 42, remediation: 'y', context: {} };
    expect(isTypedError(bad)).toBe(false);
  });

  it('returns false when context is null (not an object)', () => {
    const bad = { schema_version: '1.0', code: 10, message: 'x', remediation: 'y', context: null };
    expect(isTypedError(bad)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isTypedError({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deriveLatencyClass — boundary conditions
// ---------------------------------------------------------------------------

describe('deriveLatencyClass', () => {
  it('0ms → sub_ms', () => {
    expect(deriveLatencyClass(0)).toBe('sub_ms');
  });

  it('0.999ms → sub_ms', () => {
    expect(deriveLatencyClass(0.999)).toBe('sub_ms');
  });

  it('1ms → low_ms', () => {
    expect(deriveLatencyClass(1)).toBe('low_ms');
  });

  it('99.999ms → low_ms', () => {
    expect(deriveLatencyClass(99.999)).toBe('low_ms');
  });

  it('100ms → high_ms', () => {
    expect(deriveLatencyClass(100)).toBe('high_ms');
  });

  it('999.999ms → high_ms', () => {
    expect(deriveLatencyClass(999.999)).toBe('high_ms');
  });

  it('1000ms → seconds', () => {
    expect(deriveLatencyClass(1000)).toBe('seconds');
  });

  it('59999ms → seconds', () => {
    expect(deriveLatencyClass(59999)).toBe('seconds');
  });

  it('60000ms → minutes', () => {
    expect(deriveLatencyClass(60000)).toBe('minutes');
  });

  it('very large latency → minutes', () => {
    expect(deriveLatencyClass(3_600_000)).toBe('minutes');
  });
});

// ---------------------------------------------------------------------------
// isResultEnvelope — guard function
// ---------------------------------------------------------------------------

describe('isResultEnvelope', () => {
  it('returns true for a valid envelope', () => {
    expect(isResultEnvelope(makeEnvelope())).toBe(true);
  });

  it('returns false for null', () => {
    expect(isResultEnvelope(null)).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isResultEnvelope('not-an-envelope')).toBe(false);
  });

  it('returns false when run_id is missing', () => {
    const { run_id: _, ...noId } = makeEnvelope();
    expect(isResultEnvelope(noId)).toBe(false);
  });

  it('returns false when run_id is empty', () => {
    expect(isResultEnvelope(makeEnvelope({ run_id: '' }))).toBe(false);
  });

  it('returns false when status is invalid', () => {
    expect(isResultEnvelope(makeEnvelope({ status: 'unknown' }))).toBe(false);
  });

  it('returns true for all valid status values', () => {
    expect(isResultEnvelope(makeEnvelope({ status: 'success' }))).toBe(true);
    expect(isResultEnvelope(makeEnvelope({ status: 'partial' }))).toBe(true);
    expect(isResultEnvelope(makeEnvelope({
      status: 'failed',
      error: 'something went wrong',
    }))).toBe(true);
  });

  it('returns false when latency_ms is negative', () => {
    expect(isResultEnvelope(makeEnvelope({ latency_ms: -1, latency_class: 'sub_ms' }))).toBe(false);
  });

  it('returns false when latency_ms is Infinity', () => {
    expect(isResultEnvelope(makeEnvelope({ latency_ms: Infinity }))).toBe(false);
  });

  it('returns false when latency_class does not match latency_ms', () => {
    // latency_ms=42 → low_ms, but latency_class says sub_ms → mismatch
    expect(isResultEnvelope(makeEnvelope({ latency_ms: 42, latency_class: 'sub_ms' }))).toBe(false);
  });

  it('returns false when cycle_seq is negative', () => {
    expect(isResultEnvelope(makeEnvelope({ cycle_seq: -1 }))).toBe(false);
  });

  it('returns false when cycle_seq is non-integer', () => {
    expect(isResultEnvelope(makeEnvelope({ cycle_seq: 1.5 }))).toBe(false);
  });

  it('returns false when provenance is missing', () => {
    const { provenance: _, ...noProv } = makeEnvelope();
    expect(isResultEnvelope(noProv)).toBe(false);
  });

  it('returns false when provenance has empty combined_hash', () => {
    const badProv = { ...VALID_PROV, combined_hash: '' };
    expect(isResultEnvelope(makeEnvelope({ provenance: badProv }))).toBe(false);
  });

  it('returns false when status is success but error field is present', () => {
    expect(isResultEnvelope(makeEnvelope({ status: 'success', error: 'unexpected error' }))).toBe(false);
  });

  it('returns false when stale=true but stale_age_ms is absent', () => {
    expect(isResultEnvelope(makeEnvelope({ stale: true }))).toBe(false);
  });

  it('returns false when stale_age_ms is present but stale is not true', () => {
    expect(isResultEnvelope(makeEnvelope({ stale_age_ms: 1000 }))).toBe(false);
  });

  it('returns true when stale=true and stale_age_ms is present and non-negative', () => {
    expect(isResultEnvelope(makeEnvelope({ stale: true, stale_age_ms: 500 }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isProvenanceChain — extended edge cases
// ---------------------------------------------------------------------------

describe('isProvenanceChain — extended', () => {
  it('returns false for null', () => {
    expect(isProvenanceChain(null)).toBe(false);
  });

  it('returns false for a non-object', () => {
    expect(isProvenanceChain(42)).toBe(false);
  });

  it('returns false when algorithm_id is empty', () => {
    expect(isProvenanceChain({ ...VALID_PROV, algorithm_id: '' })).toBe(false);
  });

  it('returns false when backend_id is empty', () => {
    expect(isProvenanceChain({ ...VALID_PROV, backend_id: '' })).toBe(false);
  });

  it('returns false when kernel_version is empty', () => {
    expect(isProvenanceChain({ ...VALID_PROV, kernel_version: '' })).toBe(false);
  });

  it('returns false when wasm_build_hash is empty', () => {
    expect(isProvenanceChain({ ...VALID_PROV, wasm_build_hash: '' })).toBe(false);
  });

  it('returns false when any hash field is a number instead of string', () => {
    expect(isProvenanceChain({ ...VALID_PROV, input_hash: 12345 })).toBe(false);
  });

  it('returns true for a chain with minimal non-empty string values', () => {
    const minimal = {
      input_hash: 'x',
      config_hash: 'x',
      plan_hash: 'x',
      output_hash: 'x',
      combined_hash: 'x',
      algorithm_id: 'dfg',
      algorithm_version: '1',
      backend_id: 'wasm',
      kernel_version: '1.0',
      wasm_build_hash: 'x',
    };
    expect(isProvenanceChain(minimal)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isReceipt — edge cases not in receipt-chain.test.ts
// ---------------------------------------------------------------------------

describe('isReceipt — edge cases', () => {
  it('returns true for a valid receipt', () => {
    expect(isReceipt(makeReceipt())).toBe(true);
  });

  it('returns false for null', () => {
    expect(isReceipt(null)).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isReceipt('not-a-receipt')).toBe(false);
  });

  it('returns false when status is an invalid value', () => {
    expect(isReceipt(makeReceipt({ status: 'unknown' }))).toBe(false);
  });

  it('returns true for partial status', () => {
    expect(isReceipt(makeReceipt({ status: 'partial' }))).toBe(true);
  });

  it('returns true for failed status', () => {
    expect(isReceipt(makeReceipt({ status: 'failed' }))).toBe(true);
  });

  it('returns false when duration_ms is not a number', () => {
    expect(isReceipt(makeReceipt({ duration_ms: 'five seconds' }))).toBe(false);
  });

  it('returns false when summary is absent', () => {
    const { summary: _, ...noSummary } = makeReceipt();
    expect(isReceipt(noSummary)).toBe(false);
  });

  it('returns false when algorithm is absent', () => {
    const { algorithm: _, ...noAlgorithm } = makeReceipt();
    expect(isReceipt(noAlgorithm)).toBe(false);
  });

  it('returns false when model is absent', () => {
    const { model: _, ...noModel } = makeReceipt();
    expect(isReceipt(noModel)).toBe(false);
  });

  it('returns false when schema_version is not a string', () => {
    expect(isReceipt(makeReceipt({ schema_version: 1 }))).toBe(false);
  });

  it('returns false when run_id is not a string', () => {
    expect(isReceipt(makeReceipt({ run_id: 42 }))).toBe(false);
  });

  it('isReceipt acts as a proper type guard (TypeScript narrowing)', () => {
    const val: unknown = makeReceipt();
    if (isReceipt(val)) {
      // If this compiles, the guard narrows correctly
      const r: Receipt = val;
      expect(r.status).toBeDefined();
    } else {
      expect.fail('Expected isReceipt to return true');
    }
  });
});
