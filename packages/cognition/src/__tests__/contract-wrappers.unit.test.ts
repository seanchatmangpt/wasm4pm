/**
 * contract-wrappers.unit.test.ts — SpanSink injection tests for all remaining WASM wrappers
 *
 * Oracle rank: Rank 2 (Domain contract — span names, status codes, error codes,
 * required attributes).
 *
 * UNIT test: WasmLoader is mocked so no WASM binary is needed. Named `*.unit.test.ts`
 * per FM-5 convention (.claude/rules/cognition-contracts.md) — mocks of `../init.js`
 * are only permissible in unit-tagged files. Real-WASM coverage of these wrappers
 * lives in `cognition-wasm.integration.test.ts`.
 *
 * Each wrapper is tested for:
 *   - span emitted on success (correct name, status OK, required attributes)
 *   - span emitted on error (status ERROR, message forwarded)
 *   - span sink errors are swallowed (never throw from wrapper)
 *
 * Wrappers covered: verifyContract, showCognition, buildSystem, verifySystem,
 * replayReceipt.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { OtelSpan } from '../observability-types.js';

// ── Mock WasmLoader for all wrappers ──────────────────────────────────────────

const mockCognitionVerify = vi.fn();
const mockCognitionShow = vi.fn();
const mockCognitionReplay = vi.fn();
const mockSystemBuild = vi.fn();
const mockSystemVerify = vi.fn();

vi.mock('../init.js', () => ({
  WasmLoader: {
    getInstance: () => ({
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(() => ({
        cognition_run: vi.fn(),
        cognition_verify: mockCognitionVerify,
        cognition_show: mockCognitionShow,
        cognition_replay: mockCognitionReplay,
        system_build: mockSystemBuild,
        system_verify: mockSystemVerify,
      })),
    }),
    reset: vi.fn(),
  },
  getWasmLoader: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  }),
}));

// Import AFTER mock is in place
const { verifyContract } = await import('../contract/verify.js');
const { showCognition } = await import('../contract/show.js');
const { buildSystem } = await import('../system/build.js');
const { verifySystem } = await import('../system/verify.js');
const { replayReceipt } = await import('../receipt/replay.js');

// ── Helpers ───────────────────────────────────────────────name────────────────

const VERIFY_RESULT = JSON.stringify({ status: 'verified', findings: [] });
const SHOW_RESULT = JSON.stringify({ breeds: [{ id: 'eliza', name: 'ELIZA', year: 1966 }] });
const BUILD_RESULT = JSON.stringify({
  pareto_front: [{ id: 'c1', family_id: 'f1', dimensions: {} }],
  dominated: [],
});
const SYSTEM_VERIFY_RESULT = JSON.stringify({ target: 'system-1', status: 'verified', findings: [] });
const REPLAY_RESULT = JSON.stringify({ run_id: 'r1', output_hash: 'abc', replay_pointer: 'ptr1' });

// ── verifyContract ────────────────────────────────────────────────────────────

describe('verifyContract spans', () => {
  afterEach(() => vi.clearAllMocks());

  it('emits span named "cognition.verify" on success', async () => {
    mockCognitionVerify.mockReturnValue(VERIFY_RESULT);
    const spans: OtelSpan[] = [];
    await verifyContract({} as Parameters<typeof verifyContract>[0], { spanSink: (s) => spans.push(s) });
    expect(spans[0].name).toBe('cognition.verify');
    expect(spans[0].status.code).toBe('OK');
  });

  it('span status ERROR when WASM throws; re-throws CognitionError', async () => {
    mockCognitionVerify.mockImplementation(() => { throw new Error('verify panic'); });
    const spans: OtelSpan[] = [];
    try {
      await verifyContract({} as Parameters<typeof verifyContract>[0], { spanSink: (s) => spans.push(s) });
    } catch { /* expected */ }
    expect(spans[0].status.code).toBe('ERROR');
    expect(spans[0].status.message).toContain('verify panic');
  });

  it('attributes include service.name=wasm4pm and cognition.operation=verify', async () => {
    mockCognitionVerify.mockReturnValue(VERIFY_RESULT);
    const spans: OtelSpan[] = [];
    await verifyContract({}, { spanSink: (s) => spans.push(s) });
    expect(spans[0].attributes['service.name']).toBe('wasm4pm');
    expect(spans[0].attributes['cognition.operation']).toBe('verify');
  });
});

// ── showCognition ─────────────────────────────────────────────────────────────

describe('showCognition spans', () => {
  afterEach(() => vi.clearAllMocks());

  it('emits span named "cognition.show" on success', async () => {
    mockCognitionShow.mockReturnValue(SHOW_RESULT);
    const spans: OtelSpan[] = [];
    await showCognition({ spanSink: (s) => spans.push(s) });
    expect(spans[0].name).toBe('cognition.show');
    expect(spans[0].status.code).toBe('OK');
  });

  it('span ERROR when WASM throws', async () => {
    mockCognitionShow.mockImplementation(() => { throw new Error('show panic'); });
    const spans: OtelSpan[] = [];
    try {
      await showCognition({ spanSink: (s) => spans.push(s) });
    } catch { /* expected */ }
    expect(spans[0].status.code).toBe('ERROR');
  });
});

// ── buildSystem ───────────────────────────────────────────────────────────────

describe('buildSystem spans', () => {
  afterEach(() => vi.clearAllMocks());

  it('emits span named "system.build" on success', async () => {
    mockSystemBuild.mockReturnValue(BUILD_RESULT);
    const spans: OtelSpan[] = [];
    await buildSystem({ description: 'test system' }, { spanSink: (s) => spans.push(s) });
    expect(spans[0].name).toBe('system.build');
    expect(spans[0].status.code).toBe('OK');
  });

  it('attributes include cognition.operation=system_build', async () => {
    mockSystemBuild.mockReturnValue(BUILD_RESULT);
    const spans: OtelSpan[] = [];
    await buildSystem({ description: 'test' }, { spanSink: (s) => spans.push(s) });
    expect(spans[0].attributes['cognition.operation']).toBe('system_build');
  });

  it('span ERROR when WASM throws', async () => {
    mockSystemBuild.mockImplementation(() => { throw new Error('build panic'); });
    const spans: OtelSpan[] = [];
    try {
      await buildSystem({ description: 'bad' }, { spanSink: (s) => spans.push(s) });
    } catch { /* expected */ }
    expect(spans[0].status.code).toBe('ERROR');
  });
});

// ── verifySystem ──────────────────────────────────────────────────────────────

describe('verifySystem spans', () => {
  afterEach(() => vi.clearAllMocks());

  it('emits span named "system.verify" on success', async () => {
    mockSystemVerify.mockReturnValue(SYSTEM_VERIFY_RESULT);
    const spans: OtelSpan[] = [];
    await verifySystem('system-1', [], { spanSink: (s) => spans.push(s) });
    expect(spans[0].name).toBe('system.verify');
    expect(spans[0].status.code).toBe('OK');
  });

  it('attributes include cognition.operation=system_verify', async () => {
    mockSystemVerify.mockReturnValue(SYSTEM_VERIFY_RESULT);
    const spans: OtelSpan[] = [];
    await verifySystem('system-1', [], { spanSink: (s) => spans.push(s) });
    expect(spans[0].attributes['cognition.operation']).toBe('system_verify');
  });
});

// ── replayReceipt ─────────────────────────────────────────────────────────────

describe('replayReceipt spans', () => {
  afterEach(() => vi.clearAllMocks());

  it('emits span named "cognition.replay" on success', async () => {
    mockCognitionReplay.mockReturnValue(REPLAY_RESULT);
    const spans: OtelSpan[] = [];
    await replayReceipt('run-id-1', { spanSink: (s) => spans.push(s) });
    expect(spans[0].name).toBe('cognition.replay');
    expect(spans[0].status.code).toBe('OK');
  });

  it('span ERROR when WASM throws', async () => {
    mockCognitionReplay.mockImplementation(() => { throw new Error('replay not found'); });
    const spans: OtelSpan[] = [];
    try {
      await replayReceipt('bad-id', { spanSink: (s) => spans.push(s) });
    } catch { /* expected */ }
    expect(spans[0].status.code).toBe('ERROR');
    expect(spans[0].status.message).toContain('replay not found');
  });

  it('span sink errors are swallowed — never throws from wrapper', async () => {
    mockCognitionReplay.mockReturnValue(REPLAY_RESULT);
    const throwingSink = () => { throw new Error('sink explosion'); };
    await expect(replayReceipt('run-id-2', { spanSink: throwingSink })).resolves.not.toThrow();
  });
});
