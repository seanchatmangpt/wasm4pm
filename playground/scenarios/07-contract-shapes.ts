/**
 * Scenario: Contract shapes — Receipt, Plan, ErrorInfo, Result<T>
 *
 * Dev action simulated: "I changed ErrorInfo or the Plan DAG structure.
 * Did I break any contract invariants? Are all hash fields still correct?"
 *
 * Pure in-process: no WASM, no filesystem, no child processes.
 * All tests run in <50ms total.
 */

import { describe, it, expect } from 'vitest';
import {
  // Receipt
  isReceipt, ReceiptBuilder,
  validateReceipt,
  // Errors
  createError, validateErrorSystem, TYPED_ERROR_CODES,
  // Plan
  validatePlanDAG,
  // Result
  ok, err, error as structuredError,
  isOk, isErr, isError,
  unwrap, unwrapOr, getExitCode,
} from '@wasm4pm/contracts';
import type { Plan, ErrorCode } from '@wasm4pm/contracts';

// ── Receipt shape ─────────────────────────────────────────────────────────────

const FAKE_HASH = 'a'.repeat(64); // valid BLAKE3 hex-64

const VALID_RECEIPT = {
  run_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  schema_version: '1.0',
  config_hash: FAKE_HASH,
  input_hash: FAKE_HASH,
  plan_hash: FAKE_HASH,
  output_hash: FAKE_HASH,
  start_time: '2024-01-01T09:00:00.000Z',
  end_time:   '2024-01-01T09:00:01.000Z',
  duration_ms: 1000,
  status: 'success' as const,
  summary: { traces_processed: 3, objects_processed: 3, variants_discovered: 2 },
  algorithm: { name: 'dfg', version: '26.4.5', parameters: {} },
  model: { nodes: 4, edges: 3 },
};

describe('contracts: Receipt shape', () => {
  it('isReceipt accepts a structurally valid receipt', () => {
    expect(isReceipt(VALID_RECEIPT)).toBe(true);
  });

  it('isReceipt rejects a receipt missing output_hash', () => {
    const { output_hash: _omit, ...partial } = VALID_RECEIPT;
    expect(isReceipt(partial)).toBe(false);
  });

  it('isReceipt rejects null and primitives', () => {
    expect(isReceipt(null)).toBe(false);
    expect(isReceipt(42)).toBe(false);
    expect(isReceipt('string')).toBe(false);
  });

  it('all four hash fields match BLAKE3 hex-64 pattern', () => {
    const hexPattern = /^[0-9a-f]{64}$/;
    for (const field of ['config_hash', 'input_hash', 'plan_hash', 'output_hash'] as const) {
      expect(VALID_RECEIPT[field]).toMatch(hexPattern);
    }
  });

  it('validateReceipt returns valid:true on well-formed receipt', () => {
    const result = validateReceipt(VALID_RECEIPT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    if (result.warnings?.length > 0) console.info('[contracts] receipt warnings:', result.warnings);
  });

  it('validateReceipt catches wrong-length hash', () => {
    const bad = { ...VALID_RECEIPT, config_hash: 'tooshort' };
    const result = validateReceipt(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('config_hash'))).toBe(true);
  });

  it('ReceiptBuilder produces a valid receipt', () => {
    const receipt = new ReceiptBuilder()
      .setConfig({ algorithm: 'dfg' })
      .setInput('xes-content')
      .setPlan({ nodes: [], edges: [] })
      .setOutput({ nodes: [], edges: [] })
      .setTiming('2024-01-01T09:00:00.000Z', '2024-01-01T09:00:01.000Z')
      .setStatus('success')
      .setSummary({ traces_processed: 1, objects_processed: 1, variants_discovered: 1 })
      .setAlgorithm({ name: 'dfg', version: '26.4.5', parameters: {} })
      .setModel({ nodes: 2, edges: 1 })
      .build();

    expect(isReceipt(receipt)).toBe(true);
    expect(receipt.config_hash).toMatch(/^[0-9a-f]{64}$/);
    console.info('[contracts] built receipt run_id:', receipt.run_id);
  });
});

// ── ErrorInfo exit code ranges ────────────────────────────────────────────────

describe('contracts: ErrorInfo exit code ranges', () => {
  it('validateErrorSystem reports no mapping gaps', () => {
    const issues = validateErrorSystem();
    if (issues.length > 0) console.error('[contracts] error system issues:', issues);
    expect(issues).toHaveLength(0);
  });

  const RANGE_TABLE: [ErrorCode, number, number][] = [
    ['CONFIG_INVALID',     200, 299],
    ['CONFIG_MISSING',     200, 299],
    ['SOURCE_NOT_FOUND',   300, 399],
    ['SOURCE_INVALID',     300, 399],
    ['SOURCE_PERMISSION',  300, 399],
    ['ALGORITHM_FAILED',   400, 499],
    ['ALGORITHM_NOT_FOUND',400, 499],
    ['WASM_INIT_FAILED',   500, 599],
    ['WASM_MEMORY_EXCEEDED',500,599],
    ['SINK_FAILED',        600, 699],
    ['SINK_PERMISSION',    600, 699],
    ['OTEL_FAILED',        700, 799],
  ];

  for (const [code, lo, hi] of RANGE_TABLE) {
    it(`createError('${code}') has exit_code in ${lo}–${hi}`, () => {
      const e = createError(code, 'test message');
      expect(e.exit_code).toBeGreaterThanOrEqual(lo);
      expect(e.exit_code).toBeLessThanOrEqual(hi);
      expect(e.code).toBe(code);
      expect(typeof e.remediation).toBe('string');
      expect(e.remediation.length).toBeGreaterThan(0);
    });
  }

  it('OTEL_FAILED is recoverable (non-fatal — OTEL must not break execution)', () => {
    const e = createError('OTEL_FAILED', 'otel export failed');
    expect(e.recoverable).toBe(true);
  });

  it('CONFIG_INVALID is non-recoverable (fatal — cannot run without valid config)', () => {
    const e = createError('CONFIG_INVALID', 'bad config');
    expect(e.recoverable).toBe(false);
  });

  it('TYPED_ERROR_CODES values are all 0–255', () => {
    for (const [name, num] of Object.entries(TYPED_ERROR_CODES)) {
      expect(num, `${name} out of 0-255 range`).toBeGreaterThanOrEqual(0);
      expect(num, `${name} out of 0-255 range`).toBeLessThanOrEqual(255);
    }
    console.info('[contracts] typed codes:', TYPED_ERROR_CODES);
  });
});

// ── Plan DAG invariants ───────────────────────────────────────────────────────

function makePlan(nodes: Plan['nodes'], edges: Plan['edges']): Plan {
  return {
    schema_version: '1.0',
    plan_id: 'test-plan-001',
    created_at: '2024-01-01T00:00:00.000Z',
    nodes, edges,
    metadata: { planner: 'test', planner_version: '1.0.0' },
  };
}

describe('contracts: Plan DAG invariants', () => {
  it('valid linear plan (source → algorithm → sink) has no errors', () => {
    const plan = makePlan(
      [
        { id: 'src',  kind: 'source',    label: 'XES Source',    config: {}, version: '1.0' },
        { id: 'algo', kind: 'algorithm', label: 'DFG Discovery', config: {}, version: '1.0' },
        { id: 'snk',  kind: 'sink',      label: 'JSON Sink',     config: {}, version: '1.0' },
      ],
      [{ from: 'src', to: 'algo' }, { from: 'algo', to: 'snk' }],
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });

  it('cyclic plan is rejected', () => {
    const plan = makePlan(
      [
        { id: 'src',  kind: 'source',    label: 'Source', config: {}, version: '1.0' },
        { id: 'algo', kind: 'algorithm', label: 'Algo',   config: {}, version: '1.0' },
        { id: 'snk',  kind: 'sink',      label: 'Sink',   config: {}, version: '1.0' },
      ],
      [{ from: 'src', to: 'algo' }, { from: 'algo', to: 'snk' }, { from: 'snk', to: 'algo' }],
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some(e => /cycle/i.test(e))).toBe(true);
    console.info('[contracts] cycle errors:', errors);
  });

  it('plan without source node is rejected', () => {
    const plan = makePlan(
      [{ id: 'algo', kind: 'algorithm', label: 'Algo', config: {}, version: '1.0' }, { id: 'snk', kind: 'sink', label: 'Sink', config: {}, version: '1.0' }],
      [{ from: 'algo', to: 'snk' }],
    );
    expect(validatePlanDAG(plan).some(e => /source/i.test(e))).toBe(true);
  });

  it('plan without sink node is rejected', () => {
    const plan = makePlan(
      [{ id: 'src', kind: 'source', label: 'Source', config: {}, version: '1.0' }, { id: 'algo', kind: 'algorithm', label: 'Algo', config: {}, version: '1.0' }],
      [{ from: 'src', to: 'algo' }],
    );
    expect(validatePlanDAG(plan).some(e => /sink/i.test(e))).toBe(true);
  });

  it('self-loop is rejected', () => {
    const plan = makePlan(
      [
        { id: 'src',  kind: 'source',    label: 'Source', config: {}, version: '1.0' },
        { id: 'algo', kind: 'algorithm', label: 'Algo',   config: {}, version: '1.0' },
        { id: 'snk',  kind: 'sink',      label: 'Sink',   config: {}, version: '1.0' },
      ],
      [{ from: 'src', to: 'algo' }, { from: 'algo', to: 'algo' }, { from: 'algo', to: 'snk' }],
    );
    expect(validatePlanDAG(plan).some(e => /self-loop/i.test(e))).toBe(true);
  });

  it('edge referencing unknown node is rejected', () => {
    const plan = makePlan(
      [{ id: 'src', kind: 'source', label: 'Source', config: {}, version: '1.0' }, { id: 'snk', kind: 'sink', label: 'Sink', config: {}, version: '1.0' }],
      [{ from: 'src', to: 'ghost' }],
    );
    const errors = validatePlanDAG(plan);
    expect(errors.some(e => /ghost/i.test(e))).toBe(true);
  });

  it('diamond DAG (two parallel algorithms) is valid', () => {
    const plan = makePlan(
      [
        { id: 'src',   kind: 'source',    label: 'Source', config: {}, version: '1.0' },
        { id: 'dfg',   kind: 'algorithm', label: 'DFG',    config: {}, version: '1.0' },
        { id: 'alpha', kind: 'algorithm', label: 'Alpha',  config: {}, version: '1.0' },
        { id: 'snk',   kind: 'sink',      label: 'Sink',   config: {}, version: '1.0' },
      ],
      [{ from: 'src', to: 'dfg' }, { from: 'src', to: 'alpha' }, { from: 'dfg', to: 'snk' }, { from: 'alpha', to: 'snk' }],
    );
    expect(validatePlanDAG(plan)).toHaveLength(0);
  });
});

// ── Result<T> discriminated union ─────────────────────────────────────────────

describe('contracts: Result<T> discriminated union', () => {
  it('ok() is Ok variant with correct value', () => {
    const r = ok(42);
    expect(r.type).toBe('ok');
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(isError(r)).toBe(false);
    expect(unwrap(r)).toBe(42);
  });

  it('err() is Err variant', () => {
    const r = err('something failed');
    expect(r.type).toBe('err');
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
  });

  it('error() is ErrorResult variant with structured ErrorInfo', () => {
    const info = createError('SOURCE_NOT_FOUND', 'log.xes missing');
    const r = structuredError(info);
    expect(r.type).toBe('error');
    expect(isError(r)).toBe(true);
    expect(isOk(r)).toBe(false);
  });

  it('unwrap() throws on Err', () => {
    expect(() => unwrap(err('boom'))).toThrow();
  });

  it('unwrapOr() returns default on Err', () => {
    expect(unwrapOr(err('x'), 99)).toBe(99);
    expect(unwrapOr(ok(1), 99)).toBe(1);
  });

  it('getExitCode() returns number in SOURCE range for SOURCE_NOT_FOUND', () => {
    const r = structuredError(createError('SOURCE_NOT_FOUND', 'missing'));
    const code = getExitCode(r);
    expect(typeof code).toBe('number');
    expect(code!).toBeGreaterThanOrEqual(300);
    expect(code!).toBeLessThanOrEqual(399);
    console.info('[contracts] SOURCE_NOT_FOUND exit_code:', code);
  });

  it('getExitCode() returns undefined for Ok', () => {
    expect(getExitCode(ok('value'))).toBeUndefined();
  });

  it('all three variant types are mutually exclusive', () => {
    const types = [
      ok('x').type,
      err('y').type,
      structuredError(createError('ALGORITHM_FAILED', 'fail')).type,
    ];
    expect(new Set(types).size).toBe(3);
    expect(types).toContain('ok');
    expect(types).toContain('err');
    expect(types).toContain('error');
  });
});
