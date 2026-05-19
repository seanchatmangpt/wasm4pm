/**
 * marketplace-passport.test.ts — mcpp marketplace/passport binding contracts
 *
 * Oracle ranks:
 *   Rank 1 — Mathematical invariants (passport_ref derivation, no aliasing)
 *   Rank 2 — Domain contracts (admission format, X01–X10 cross-runtime probes)
 *
 * These tests validate the integration surface between wasm4pm receipts and
 * the mcpp marketplace/passport system without requiring the mcpp runtime to
 * be running. All assertions are derived from:
 *   - Receipt schema (packages/contracts/src/receipt.ts, schema_version "1.0")
 *   - mcpp CROSSRT probe taxonomy (docs/CROSS_RUNTIME_VALIDATION.md, v26.5.19 Slice κ)
 *   - mcpp MCPP_VERSION = "1.0" (packages/config/src/mcpp-bridge.ts)
 *
 * No mcpp imports — pure contract testing against wasm4pm types.
 */

import { describe, it, expect } from 'vitest';
import type { Receipt } from '@wasm4pm/contracts';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * MarketplaceAdmission is the normalized object produced from a wasm4pm Receipt
 * and submitted to the mcpp marketplace admission gate.
 *
 * Domain contracts (Rank 2):
 *   - passport_ref: non-empty string derived from run_id + output_hash
 *   - algorithm: non-empty string (from receipt.algorithm.name)
 *   - fitness: number in [0, 1]
 *   - run_id: string (UUID v4 from the receipt)
 *   - admitted: boolean — true iff receipt.status === 'success'
 */
export interface MarketplaceAdmission {
  passport_ref: string;
  algorithm: string;
  fitness: number;
  run_id: string;
  admitted: boolean;
}

// ── Inline implementation under test ─────────────────────────────────────────
// These functions are defined here (not imported from production code) because
// the marketplace-passport bridge does not yet exist as a separate module.
// Writing them inline validates the contracts that the future module must satisfy.

/**
 * Derives a passport_ref from a receipt.
 * Contract (Rank 1 invariant): passport_ref = run_id + ":" + output_hash
 * This must be deterministic and injective (no aliasing).
 */
function derivePassportRef(receipt: Pick<Receipt, 'run_id' | 'output_hash'>): string {
  return `${receipt.run_id}:${receipt.output_hash}`;
}

/**
 * Converts a wasm4pm Receipt into a MarketplaceAdmission object.
 *
 * Fitness mapping (Rank 2 domain contract):
 *   status='success'  → fitness=1.0, admitted=true
 *   status='partial'  → fitness=0.5, admitted=false
 *   status='failed'   → fitness=0.0, admitted=false
 */
function receiptToAdmission(receipt: Receipt): MarketplaceAdmission {
  let fitness: number;
  let admitted: boolean;

  switch (receipt.status) {
    case 'success':
      fitness = 1.0;
      admitted = true;
      break;
    case 'partial':
      fitness = 0.5;
      admitted = false;
      break;
    case 'failed':
    default:
      fitness = 0.0;
      admitted = false;
      break;
  }

  return {
    passport_ref: derivePassportRef(receipt),
    algorithm: receipt.algorithm.name,
    fitness,
    run_id: receipt.run_id,
    admitted,
  };
}

// ── X01–X10 probe implementation ──────────────────────────────────────────────

/**
 * X01–X10 cross-runtime probe taxonomy from mcpp v26.5.19 Slice κ.
 *
 * Each probe answers a yes/no question about a wasm4pm Receipt.
 * The probe IDs are remapped to wasm4pm receipt semantics:
 *
 *   X01 receipt format valid (run_id, schema_version, status present)
 *   X02 BLAKE3 hash fields are exactly 64 lowercase hex chars
 *   X03 timestamps are valid ISO 8601 strings
 *   X04 duration_ms is a non-negative integer
 *   X05 algorithm name is non-empty string
 *   X06 summary has traces_processed, objects_processed, variants_discovered (non-negative integers)
 *   X07 status is one of 'success'|'partial'|'failed'
 *   X08 schema_version is '1.0'
 *   X09 model has nodes and edges (both non-negative integers)
 *   X10 run_id passes UUID v4 format check
 *
 * Returns { passed: string[], failed: string[] } where each string is a probe ID.
 */
function validateProbes(receipt: unknown): { passed: string[]; failed: string[] } {
  const passed: string[] = [];
  const failed: string[] = [];

  const probe = (id: string, passes: boolean) => {
    (passes ? passed : failed).push(id);
  };

  // Narrow to object with index access
  const r = (receipt && typeof receipt === 'object' ? receipt : {}) as Record<string, unknown>;

  // X01 — receipt format valid: run_id, schema_version, status present
  probe(
    'X01',
    typeof r['run_id'] === 'string' &&
      typeof r['schema_version'] === 'string' &&
      typeof r['status'] === 'string'
  );

  // X02 — BLAKE3 hash fields are exactly 64 lowercase hex chars
  const blake3Pattern = /^[0-9a-f]{64}$/;
  const hashFields = ['config_hash', 'input_hash', 'plan_hash', 'output_hash'] as const;
  probe(
    'X02',
    hashFields.every(
      (f) => typeof r[f] === 'string' && blake3Pattern.test(r[f] as string)
    )
  );

  // X03 — timestamps are valid ISO 8601 strings
  const isIso8601 = (v: unknown): boolean => {
    if (typeof v !== 'string') return false;
    const d = new Date(v);
    return !isNaN(d.getTime()) && v.includes('T');
  };
  probe('X03', isIso8601(r['start_time']) && isIso8601(r['end_time']));

  // X04 — duration_ms is a non-negative integer
  probe(
    'X04',
    typeof r['duration_ms'] === 'number' &&
      Number.isInteger(r['duration_ms']) &&
      (r['duration_ms'] as number) >= 0
  );

  // X05 — algorithm name is non-empty string
  const algorithm = r['algorithm'];
  probe(
    'X05',
    typeof algorithm === 'object' &&
      algorithm !== null &&
      typeof (algorithm as Record<string, unknown>)['name'] === 'string' &&
      ((algorithm as Record<string, unknown>)['name'] as string).length > 0
  );

  // X06 — summary has traces_processed, objects_processed, variants_discovered (non-negative integers)
  const summary = r['summary'];
  const isNonNegInt = (v: unknown): boolean =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0;
  probe(
    'X06',
    typeof summary === 'object' &&
      summary !== null &&
      isNonNegInt((summary as Record<string, unknown>)['traces_processed']) &&
      isNonNegInt((summary as Record<string, unknown>)['objects_processed']) &&
      isNonNegInt((summary as Record<string, unknown>)['variants_discovered'])
  );

  // X07 — status is one of 'success'|'partial'|'failed'
  probe('X07', ['success', 'partial', 'failed'].includes(r['status'] as string));

  // X08 — schema_version is '1.0'
  probe('X08', r['schema_version'] === '1.0');

  // X09 — model has nodes and edges (both non-negative integers)
  const model = r['model'];
  probe(
    'X09',
    typeof model === 'object' &&
      model !== null &&
      isNonNegInt((model as Record<string, unknown>)['nodes']) &&
      isNonNegInt((model as Record<string, unknown>)['edges'])
  );

  // X10 — run_id passes UUID v4 format check
  const uuidV4Pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  probe('X10', typeof r['run_id'] === 'string' && uuidV4Pattern.test(r['run_id'] as string));

  return { passed, failed };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BLAKE3_ZERO = '0'.repeat(64);
const BLAKE3_ONE = '1'.repeat(64);
const BLAKE3_ALPHA = 'a'.repeat(64);

const UUID_V4_A = '550e8400-e29b-41d4-a716-446655440000';
const UUID_V4_B = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    run_id: UUID_V4_A,
    schema_version: '1.0',
    config_hash: BLAKE3_ZERO,
    input_hash: BLAKE3_ONE,
    plan_hash: BLAKE3_ALPHA,
    output_hash: 'b'.repeat(64),
    start_time: '2026-05-17T10:00:00.000Z',
    end_time: '2026-05-17T10:00:01.000Z',
    duration_ms: 1000,
    status: 'success',
    summary: {
      traces_processed: 42,
      objects_processed: 100,
      variants_discovered: 7,
    },
    algorithm: {
      name: 'dfg',
      version: '1.0.0',
      parameters: {},
    },
    model: {
      nodes: 5,
      edges: 8,
    },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('marketplace admission format (Rank 2 — domain contracts)', () => {
  it('success receipt produces valid marketplace admission object', () => {
    const receipt = makeReceipt({ status: 'success' });
    const admission = receiptToAdmission(receipt);

    expect(typeof admission.passport_ref).toBe('string');
    expect(admission.passport_ref.length).toBeGreaterThan(0);
    expect(typeof admission.algorithm).toBe('string');
    expect(admission.algorithm).toBe('dfg');
    expect(typeof admission.fitness).toBe('number');
    expect(admission.fitness).toBeGreaterThanOrEqual(0);
    expect(admission.fitness).toBeLessThanOrEqual(1);
    expect(typeof admission.run_id).toBe('string');
    expect(admission.run_id).toBe(UUID_V4_A);
  });

  it('failed receipt produces fitness=0.0 and admitted=false', () => {
    const receipt = makeReceipt({ status: 'failed' });
    const admission = receiptToAdmission(receipt);

    expect(admission.fitness).toBe(0.0);
    expect(admission.admitted).toBe(false);
  });

  it('success receipt produces fitness=1.0 and admitted=true', () => {
    const receipt = makeReceipt({ status: 'success' });
    const admission = receiptToAdmission(receipt);

    expect(admission.fitness).toBe(1.0);
    expect(admission.admitted).toBe(true);
  });

  it('partial receipt produces fitness=0.5 and admitted=false', () => {
    const receipt = makeReceipt({ status: 'partial' });
    const admission = receiptToAdmission(receipt);

    expect(admission.fitness).toBe(0.5);
    expect(admission.admitted).toBe(false);
  });

  it('admission carries the algorithm name from the receipt', () => {
    const receipt = makeReceipt({ algorithm: { name: 'heuristic_miner', version: '1.0.0', parameters: {} } });
    const admission = receiptToAdmission(receipt);
    expect(admission.algorithm).toBe('heuristic_miner');
  });

  it('admission fitness is always in [0, 1] for all valid status values', () => {
    const statuses: Array<Receipt['status']> = ['success', 'partial', 'failed'];
    for (const status of statuses) {
      const admission = receiptToAdmission(makeReceipt({ status }));
      expect(admission.fitness).toBeGreaterThanOrEqual(0);
      expect(admission.fitness).toBeLessThanOrEqual(1);
    }
  });
});

describe('passport binding (Rank 1 — invariants)', () => {
  it('passport_ref is derived from run_id + output_hash (concatenated and consistent)', () => {
    const receipt = makeReceipt({ run_id: UUID_V4_A, output_hash: 'c'.repeat(64) });
    const ref = derivePassportRef(receipt);

    // Must contain both the run_id and the output_hash
    expect(ref).toContain(UUID_V4_A);
    expect(ref).toContain('c'.repeat(64));
  });

  it('same run_id always produces the same passport_ref (deterministic)', () => {
    const receipt = makeReceipt({ run_id: UUID_V4_A, output_hash: 'd'.repeat(64) });
    const ref1 = derivePassportRef(receipt);
    const ref2 = derivePassportRef(receipt);
    expect(ref1).toBe(ref2);
  });

  it('different run_ids always produce different passport_refs (no aliasing)', () => {
    const output_hash = 'e'.repeat(64);
    const ref1 = derivePassportRef({ run_id: UUID_V4_A, output_hash });
    const ref2 = derivePassportRef({ run_id: UUID_V4_B, output_hash });
    expect(ref1).not.toBe(ref2);
  });

  it('same run_id with different output_hash produces different passport_refs', () => {
    const ref1 = derivePassportRef({ run_id: UUID_V4_A, output_hash: 'f'.repeat(64) });
    const ref2 = derivePassportRef({ run_id: UUID_V4_A, output_hash: '9'.repeat(64) });
    expect(ref1).not.toBe(ref2);
  });

  it('passport_ref derived from admission matches direct derivation', () => {
    const receipt = makeReceipt({ status: 'success' });
    const admission = receiptToAdmission(receipt);
    const directRef = derivePassportRef(receipt);
    expect(admission.passport_ref).toBe(directRef);
  });
});

describe('cross-runtime probe format X01–X10 (Rank 2 — domain contracts)', () => {
  it('valid receipt passes all 10 probes', () => {
    const receipt = makeReceipt();
    const { passed, failed } = validateProbes(receipt);

    expect(failed).toEqual([]);
    expect(passed).toHaveLength(10);
    expect(passed.sort()).toEqual(
      ['X01', 'X02', 'X03', 'X04', 'X05', 'X06', 'X07', 'X08', 'X09', 'X10'].sort()
    );
  });

  it('X01 fails when run_id is missing', () => {
    const r = makeReceipt() as unknown as Record<string, unknown>;
    delete r['run_id'];
    const { failed } = validateProbes(r);
    expect(failed).toContain('X01');
  });

  it('X01 fails when schema_version is missing', () => {
    const r = makeReceipt() as unknown as Record<string, unknown>;
    delete r['schema_version'];
    const { failed } = validateProbes(r);
    expect(failed).toContain('X01');
  });

  it('X01 fails when status is missing', () => {
    const r = makeReceipt() as unknown as Record<string, unknown>;
    delete r['status'];
    const { failed } = validateProbes(r);
    expect(failed).toContain('X01');
  });

  it('X02 fails when config_hash is not 64 lowercase hex chars', () => {
    const r = makeReceipt({ config_hash: 'tooshort' });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X02');
  });

  it('X02 fails when output_hash contains uppercase hex', () => {
    const r = makeReceipt({ output_hash: 'A'.repeat(64) });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X02');
  });

  it('X02 passes for all hash fields when they are valid 64-char lowercase hex', () => {
    const receipt = makeReceipt();
    const { passed } = validateProbes(receipt);
    expect(passed).toContain('X02');
  });

  it('X03 fails when start_time is not a valid ISO 8601 timestamp', () => {
    const r = makeReceipt({ start_time: '2026-05-17' }); // date only, no T
    const { failed } = validateProbes(r);
    expect(failed).toContain('X03');
  });

  it('X03 fails when end_time is an invalid date string', () => {
    const r = makeReceipt({ end_time: 'not-a-date' });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X03');
  });

  it('X04 fails when duration_ms is negative', () => {
    const r = makeReceipt({ duration_ms: -1 });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X04');
  });

  it('X04 fails when duration_ms is a float', () => {
    const r = makeReceipt({ duration_ms: 1.5 });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X04');
  });

  it('X04 passes when duration_ms is 0', () => {
    const receipt = makeReceipt({ duration_ms: 0 });
    const { passed } = validateProbes(receipt);
    expect(passed).toContain('X04');
  });

  it('X05 fails when algorithm name is empty string', () => {
    const r = makeReceipt({ algorithm: { name: '', version: '1.0.0', parameters: {} } });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X05');
  });

  it('X05 fails when algorithm field is missing', () => {
    const r = makeReceipt() as unknown as Record<string, unknown>;
    delete r['algorithm'];
    const { failed } = validateProbes(r);
    expect(failed).toContain('X05');
  });

  it('X06 fails when traces_processed is negative', () => {
    const r = makeReceipt({
      summary: { traces_processed: -1, objects_processed: 0, variants_discovered: 0 },
    });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X06');
  });

  it('X06 fails when variants_discovered is a float', () => {
    const r = makeReceipt({
      summary: { traces_processed: 1, objects_processed: 0, variants_discovered: 2.7 },
    });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X06');
  });

  it('X06 passes when all summary counts are zero', () => {
    const receipt = makeReceipt({
      summary: { traces_processed: 0, objects_processed: 0, variants_discovered: 0 },
    });
    const { passed } = validateProbes(receipt);
    expect(passed).toContain('X06');
  });

  it('X07 fails when status is an unrecognised value', () => {
    const r = makeReceipt() as unknown as Record<string, unknown>;
    r['status'] = 'unknown';
    const { failed } = validateProbes(r);
    expect(failed).toContain('X07');
  });

  it('X07 passes for all three valid status values', () => {
    for (const status of ['success', 'partial', 'failed'] as const) {
      const { passed } = validateProbes(makeReceipt({ status }));
      expect(passed).toContain('X07');
    }
  });

  it('X08 fails when schema_version is not "1.0"', () => {
    const r = makeReceipt({ schema_version: '2.0' } as unknown as Partial<Receipt>);
    const { failed } = validateProbes(r);
    expect(failed).toContain('X08');
  });

  it('X08 fails when schema_version is missing', () => {
    const r = makeReceipt() as unknown as Record<string, unknown>;
    delete r['schema_version'];
    const { failed } = validateProbes(r);
    expect(failed).toContain('X08');
  });

  it('X09 fails when model nodes is negative', () => {
    const r = makeReceipt({ model: { nodes: -1, edges: 0 } });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X09');
  });

  it('X09 fails when model field is absent', () => {
    const r = makeReceipt() as unknown as Record<string, unknown>;
    delete r['model'];
    const { failed } = validateProbes(r);
    expect(failed).toContain('X09');
  });

  it('X09 passes when both nodes and edges are 0', () => {
    const receipt = makeReceipt({ model: { nodes: 0, edges: 0 } });
    const { passed } = validateProbes(receipt);
    expect(passed).toContain('X09');
  });

  it('X10 fails when run_id is not a UUID v4', () => {
    const r = makeReceipt({ run_id: 'not-a-uuid' });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X10');
  });

  it('X10 fails when run_id is UUID v1 format', () => {
    // UUID v1 uses version digit 1, not 4
    const r = makeReceipt({ run_id: '550e8400-e29b-11d4-a716-446655440000' });
    const { failed } = validateProbes(r);
    expect(failed).toContain('X10');
  });

  it('X10 passes for valid UUID v4 with uppercase hex', () => {
    // UUID v4 pattern check is case-insensitive
    const receipt = makeReceipt({ run_id: 'F47AC10B-58CC-4372-A567-0E02B2C3D479' });
    const { passed } = validateProbes(receipt);
    expect(passed).toContain('X10');
  });

  it('null input fails all probes', () => {
    const { passed, failed } = validateProbes(null);
    expect(passed).toHaveLength(0);
    expect(failed).toHaveLength(10);
  });

  it('empty object fails all probes', () => {
    const { passed, failed } = validateProbes({});
    expect(passed).toHaveLength(0);
    expect(failed).toHaveLength(10);
  });
});

describe('validateProbes completeness contract', () => {
  it('always returns exactly 10 probes total (passed + failed)', () => {
    const cases = [
      makeReceipt(),
      makeReceipt({ status: 'failed' }),
      {},
      null,
      { run_id: 'bad', schema_version: '1.0', status: 'success' },
    ];

    for (const c of cases) {
      const { passed, failed } = validateProbes(c);
      expect(passed.length + failed.length).toBe(10);
    }
  });

  it('probe IDs are always drawn from the X01–X10 set', () => {
    const validIds = new Set(['X01', 'X02', 'X03', 'X04', 'X05', 'X06', 'X07', 'X08', 'X09', 'X10']);
    const { passed, failed } = validateProbes(makeReceipt());
    for (const id of [...passed, ...failed]) {
      expect(validIds.has(id)).toBe(true);
    }
  });

  it('no probe ID appears in both passed and failed', () => {
    const { passed, failed } = validateProbes(makeReceipt());
    const passedSet = new Set(passed);
    for (const id of failed) {
      expect(passedSet.has(id)).toBe(false);
    }
  });
});
