import { describe, it, expect } from 'vitest';
import { validateReceiptSchema, type Receipt } from '@wasm4pm/contracts';
import { hashData, hashJsonString } from '@wasm4pm/contracts';

/**
 * PROOF: receipt schema validation + BLAKE3 hash closure.
 *
 * INVARIANT — a structurally valid Receipt passes validateReceiptSchema, the
 * BLAKE3 hash function produces a 64-char lowercase-hex digest, and hashing is
 * deterministic (same input → identical output).
 *
 * Grounded in real exports:
 *  - @wasm4pm/contracts → validateReceiptSchema(receipt): receipt is Receipt
 *    (packages/contracts/src/receipt.ts:197) + Receipt interface (receipt.ts:67)
 *  - @wasm4pm/contracts → hashData / hashJsonString (BLAKE3, contracts/src/hash.ts)
 *    both documented to return 64-char hex (hash-invariants.test.ts asserts /^[0-9a-f]{64}$/)
 *
 * Anti-FM-5: assert hash length/hex pattern and determinism — NOT a specific
 * digest value derived from the BLAKE3 implementation.
 */

/** A minimal, schema-complete Receipt built from the real Receipt interface. */
function buildMinimalReceipt(): Receipt {
  const zeroHash = '0'.repeat(64); // valid 64-hex placeholder
  return {
    run_id: '00000000-0000-4000-8000-000000000000',
    schema_version: '1.0',
    config_hash: zeroHash,
    input_hash: zeroHash,
    plan_hash: zeroHash,
    output_hash: zeroHash,
    start_time: '2026-05-29T00:00:00.000Z',
    end_time: '2026-05-29T00:00:01.000Z',
    duration_ms: 1000,
    status: 'success',
    summary: {
      traces_processed: 1,
      objects_processed: 0,
      variants_discovered: 1,
    },
    algorithm: { name: 'dfg', version: '1.0', parameters: {} },
    model: { nodes: 2, edges: 1 },
  };
}

describe('receipt.proof — receipt schema + BLAKE3 closure', () => {
  it('validateReceiptSchema accepts a minimal valid receipt', () => {
    const receipt = buildMinimalReceipt();
    expect(validateReceiptSchema(receipt)).toBe(true);
  });

  it('BLAKE3 hash is exactly 64 lowercase hex chars', () => {
    const h = hashData({ canon: 'receipt-proof' });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    const hs = hashJsonString('{"canon":"receipt-proof"}');
    expect(hs).toMatch(/^[0-9a-f]{64}$/);
  });

  it('BLAKE3 hashing is deterministic — same input twice → identical output', () => {
    const input = { a: 1, b: ['x', 'y'], nested: { z: true } };
    expect(hashData(input)).toBe(hashData(input));
    expect(hashJsonString('stable-content')).toBe(hashJsonString('stable-content'));
  });
});
