/**
 * contract-run.test.ts — SpanSink injection tests for runContract
 *
 * Oracle rank: Rank 2 (Domain contract — span name, status code, required attributes).
 *
 * WasmLoader is mocked so no WASM binary is needed.
 * Tests verify the span emission contract: fires on both success and error,
 * carries correct name/attributes, never throws from the sink.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { OtelSpan } from '../observability-types.js';

// ── Mock WasmLoader before importing runContract ──────────────────────────────

const mockCognitionRun = vi.fn();
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn(() => ({
  cognition_run: mockCognitionRun,
  cognition_verify: vi.fn(),
  cognition_replay: vi.fn(),
  cognition_show: vi.fn(),
  system_build: vi.fn(),
  system_verify: vi.fn(),
}));

vi.mock('../init.js', () => ({
  WasmLoader: {
    getInstance: () => ({ init: mockInit, get: mockGet }),
    reset: vi.fn(),
  },
  getWasmLoader: () => ({ init: mockInit, get: mockGet }),
}));

// Import AFTER mock is in place
const { runContract } = await import('../contract/run.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput() {
  return {
    intent: 'test',
    candidates: [{ id: 'c1', score: 0.9, eliminated: false }],
    facts: [],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

const SUCCESS_OUTPUT = JSON.stringify({
  exit_code: 0,
  output: { breed: 'ELIZA', candidates: [], facts: [], explanation: 'ELIZA pattern matching' },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runContract span emission', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('emits a span named "cognition.run" on success', async () => {
    mockCognitionRun.mockReturnValue(SUCCESS_OUTPUT);
    const spans: OtelSpan[] = [];

    await runContract(makeInput(), { spanSink: (s) => spans.push(s) });

    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('cognition.run');
  });

  it('span status.code is "OK" on success', async () => {
    mockCognitionRun.mockReturnValue(SUCCESS_OUTPUT);
    const spans: OtelSpan[] = [];

    await runContract(makeInput(), { spanSink: (s) => spans.push(s) });

    expect(spans[0].status.code).toBe('OK');
    expect(spans[0].status.message).toBeUndefined();
  });

  it('span status.code is "ERROR" when WASM throws', async () => {
    mockCognitionRun.mockImplementation(() => { throw new Error('wasm panic'); });
    const spans: OtelSpan[] = [];

    try {
      await runContract(makeInput(), { spanSink: (s) => spans.push(s) });
    } catch {
      // expected
    }

    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe('ERROR');
    expect(spans[0].status.message).toContain('wasm panic');
  });

  it('span has required attributes: service.name, cognition.operation, cognition.duration_ms', async () => {
    mockCognitionRun.mockReturnValue(SUCCESS_OUTPUT);
    const spans: OtelSpan[] = [];

    await runContract(makeInput(), { spanSink: (s) => spans.push(s) });

    const attrs = spans[0].attributes;
    expect(attrs['service.name']).toBe('wasm4pm');
    expect(attrs['cognition.operation']).toBe('run');
    expect(typeof attrs['cognition.duration_ms']).toBe('number');
    expect(attrs['cognition.duration_ms'] as number).toBeGreaterThanOrEqual(0);
  });

  it('span trace_id is 32 hex chars, span_id is 16 hex chars', async () => {
    mockCognitionRun.mockReturnValue(SUCCESS_OUTPUT);
    const spans: OtelSpan[] = [];

    await runContract(makeInput(), { spanSink: (s) => spans.push(s) });

    expect(spans[0].trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(spans[0].span_id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('span is emitted even when spanSink itself throws', async () => {
    mockCognitionRun.mockReturnValue(SUCCESS_OUTPUT);
    let sinkCalled = false;
    const throwingSink = () => {
      sinkCalled = true;
      throw new Error('sink explosion');
    };

    // Should not throw even though the sink throws
    await expect(runContract(makeInput(), { spanSink: throwingSink })).resolves.not.toThrow();
    expect(sinkCalled).toBe(true);
  });
});
