/**
 * Validation Module Tests
 *
 * Covers validateReceipt, verifyReceiptHashes, verifyReceipt, and detectTampering.
 * Uses real BLAKE3 hashes via hashData so hash-verification tests are honest.
 */

import { describe, it, expect } from 'vitest';
import { validateReceipt, verifyReceiptHashes, verifyReceipt, detectTampering } from '../validation';
import { hashData } from '../hash';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const VALID_UUID = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';
const START_TIME = '2026-05-16T10:00:00.000Z';
const END_TIME = '2026-05-16T10:00:05.000Z';

function makeReceipt(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    run_id: VALID_UUID,
    schema_version: '1.1',
    trace_id: 'a'.repeat(32),
    config_hash: 'a'.repeat(64),
    input_hash: 'b'.repeat(64),
    plan_hash: 'c'.repeat(64),
    output_hash: 'd'.repeat(64),
    start_time: START_TIME,
    end_time: END_TIME,
    duration_ms: 5000,
    status: 'success',
    summary: { traces_processed: 42, objects_processed: 100, variants_discovered: 7 },
    algorithm: { name: 'alpha-plus-plus', version: '2.1.0', parameters: {} },
    model: { nodes: 5, edges: 8 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateReceipt
// ---------------------------------------------------------------------------

describe('validateReceipt', () => {
  it('passes for a well-formed receipt', () => {
    const result = validateReceipt(makeReceipt());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when receipt is null', () => {
    const result = validateReceipt(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('fails when a required string field is missing (run_id)', () => {
    const r = makeReceipt({ run_id: undefined });
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('run_id'))).toBe(true);
  });

  it('fails when run_id is not a valid UUID', () => {
    const r = makeReceipt({ run_id: 'not-a-uuid' });
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('run_id'))).toBe(true);
  });

  it('fails when duration_ms is missing', () => {
    const r = makeReceipt({ duration_ms: undefined });
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duration_ms'))).toBe(true);
  });

  it('fails when status is an unrecognised value', () => {
    const r = makeReceipt({ status: 'unknown' });
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('fails when a hash field has wrong length', () => {
    // 63 hex chars — one short of the required 64
    const r = makeReceipt({ config_hash: 'a'.repeat(63) });
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('config_hash'))).toBe(true);
  });

  it('fails when a hash field contains invalid hex characters', () => {
    const r = makeReceipt({ input_hash: 'z'.repeat(64) });
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('input_hash'))).toBe(true);
  });

  it('warns when schema_version is not 1.0', () => {
    const r = makeReceipt({ schema_version: '2.0' });
    const result = validateReceipt(r);
    // Unrecognised schema generates a warning, not necessarily an error
    expect(result.warnings.some((w) => w.includes('schema'))).toBe(true);
  });

  it('warns when status is failed but no error field is provided', () => {
    const r = makeReceipt({ status: 'failed' });
    const result = validateReceipt(r);
    expect(result.warnings.some((w) => w.includes('error'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifyReceiptHashes
// ---------------------------------------------------------------------------

describe('verifyReceiptHashes', () => {
  it('passes when all three hash arguments match what is stored in the receipt', () => {
    const config = { env: 'test', version: 1 };
    const input = [{ case: 'A', event: 'start' }];
    const plan = { steps: ['mine', 'conform'] };

    const receipt = makeReceipt({
      config_hash: hashData(config),
      input_hash: hashData(input),
      plan_hash: hashData(plan),
    });

    const result = verifyReceiptHashes(receipt, config, input, plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when config_hash was tampered with', () => {
    const config = { env: 'test' };
    const input = { x: 1 };
    const plan = { steps: [] };

    // Receipt stores hash of original config; we pass a different config object
    const receipt = makeReceipt({
      config_hash: hashData({ env: 'production' }), // wrong config
      input_hash: hashData(input),
      plan_hash: hashData(plan),
    });

    const result = verifyReceiptHashes(receipt, config, input, plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('config_hash'))).toBe(true);
  });

  it('fails when the receipt itself is structurally invalid', () => {
    // Short hash → validateReceipt fails → verifyReceiptHashes returns that failure
    const receipt = makeReceipt({ plan_hash: 'bad' });
    const result = verifyReceiptHashes(receipt, {}, {}, {});
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyReceipt
// ---------------------------------------------------------------------------

describe('verifyReceipt', () => {
  it('passes when all four expected hashes match the receipt', () => {
    const hashes = {
      config_hash: 'a'.repeat(64),
      input_hash: 'b'.repeat(64),
      plan_hash: 'c'.repeat(64),
      output_hash: 'd'.repeat(64),
    };
    const receipt = makeReceipt(hashes);

    const result = verifyReceipt(receipt, hashes);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when output_hash does not match expected', () => {
    const receipt = makeReceipt({ output_hash: 'd'.repeat(64) });
    const result = verifyReceipt(receipt, {
      config_hash: 'a'.repeat(64),
      input_hash: 'b'.repeat(64),
      plan_hash: 'c'.repeat(64),
      output_hash: 'e'.repeat(64), // mismatch
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('output_hash'))).toBe(true);
  });

  it('fails when the receipt is structurally invalid before hash comparison', () => {
    const receipt = makeReceipt({ summary: null });
    const result = verifyReceipt(receipt, {
      config_hash: 'a'.repeat(64),
      input_hash: 'b'.repeat(64),
      plan_hash: 'c'.repeat(64),
      output_hash: 'd'.repeat(64),
    });
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectTampering
// ---------------------------------------------------------------------------

describe('detectTampering', () => {
  it('returns false for an untampered receipt whose hashes match the supplied data', () => {
    const config = { env: 'test' };
    const input = { trace: 'T1' };
    const plan = { steps: ['discover'] };

    const receipt = makeReceipt({
      config_hash: hashData(config),
      input_hash: hashData(input),
      plan_hash: hashData(plan),
    });

    expect(detectTampering(receipt, config, input, plan)).toBe(false);
  });

  it('returns true when input_hash was modified (tampered receipt)', () => {
    const config = { env: 'test' };
    const input = { trace: 'T1' };
    const plan = { steps: ['discover'] };

    // Receipt claims input was something else
    const receipt = makeReceipt({
      config_hash: hashData(config),
      input_hash: hashData({ trace: 'INJECTED' }), // tampered
      plan_hash: hashData(plan),
    });

    expect(detectTampering(receipt, config, input, plan)).toBe(true);
  });

  it('returns true when plan_hash was modified', () => {
    const config = { env: 'test' };
    const input = { trace: 'T1' };
    const plan = { steps: ['discover'] };

    const receipt = makeReceipt({
      config_hash: hashData(config),
      input_hash: hashData(input),
      plan_hash: hashData({ steps: ['FAKE'] }), // tampered
    });

    expect(detectTampering(receipt, config, input, plan)).toBe(true);
  });
});
