/**
 * system-shape-validation.unit.test.ts — Rank-2 domain contract.
 *
 * cognition-contracts.md mandates `system_build` returns
 * `{ pareto_front: [...], dominated: [...] }` and `system_verify` returns
 * `{ target, status, findings: [...] }`. The TS wrappers MUST reject malformed
 * WASM output rather than silently passing it through.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

const mockSystemBuild = vi.fn();
const mockSystemVerify = vi.fn();

vi.mock('../init.js', () => ({
  WasmLoader: {
    getInstance: () => ({
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(() => ({
        system_build: mockSystemBuild,
        system_verify: mockSystemVerify,
      })),
    }),
    reset: vi.fn(),
  },
}));

const { buildSystem } = await import('../system/build.js');
const { verifySystem } = await import('../system/verify.js');

describe('buildSystem shape validation', () => {
  afterEach(() => vi.clearAllMocks());

  it('accepts well-formed output', async () => {
    mockSystemBuild.mockReturnValue(
      JSON.stringify({ pareto_front: [], dominated: [] }),
    );
    const result = await buildSystem({ description: 'ok' });
    expect(result.pareto_front).toEqual([]);
    expect(result.dominated).toEqual([]);
  });

  it('rejects output missing pareto_front', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify({ dominated: [] }));
    await expect(buildSystem({ description: 'x' })).rejects.toMatchObject({
      code: 'OUTPUT_SHAPE_INVALID',
    });
  });

  it('rejects output missing dominated', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify({ pareto_front: [] }));
    await expect(buildSystem({ description: 'x' })).rejects.toMatchObject({
      code: 'OUTPUT_SHAPE_INVALID',
    });
  });

  it('rejects non-array pareto_front', async () => {
    mockSystemBuild.mockReturnValue(
      JSON.stringify({ pareto_front: 'oops', dominated: [] }),
    );
    await expect(buildSystem({ description: 'x' })).rejects.toMatchObject({
      code: 'OUTPUT_SHAPE_INVALID',
    });
  });

  it('rejects non-array dominated', async () => {
    mockSystemBuild.mockReturnValue(
      JSON.stringify({ pareto_front: [], dominated: { x: 1 } }),
    );
    await expect(buildSystem({ description: 'x' })).rejects.toMatchObject({
      code: 'OUTPUT_SHAPE_INVALID',
    });
  });

  it('rejects null output', async () => {
    mockSystemBuild.mockReturnValue('null');
    await expect(buildSystem({ description: 'x' })).rejects.toMatchObject({
      code: 'OUTPUT_SHAPE_INVALID',
    });
  });
});

describe('verifySystem shape validation', () => {
  afterEach(() => vi.clearAllMocks());

  it('accepts well-formed output', async () => {
    mockSystemVerify.mockReturnValue(
      JSON.stringify({ target: 'sys-1', status: 'verified', findings: [] }),
    );
    const result = await verifySystem('sys-1', []);
    expect(result.target).toBe('sys-1');
    expect(result.findings).toEqual([]);
  });

  it('rejects missing target', async () => {
    mockSystemVerify.mockReturnValue(
      JSON.stringify({ status: 'verified', findings: [] }),
    );
    await expect(verifySystem('sys-1', [])).rejects.toMatchObject({
      code: 'OUTPUT_SHAPE_INVALID',
    });
  });

  it('rejects missing findings array', async () => {
    mockSystemVerify.mockReturnValue(
      JSON.stringify({ target: 'sys-1', status: 'verified' }),
    );
    await expect(verifySystem('sys-1', [])).rejects.toMatchObject({
      code: 'OUTPUT_SHAPE_INVALID',
    });
  });

  it('rejects non-string target', async () => {
    mockSystemVerify.mockReturnValue(
      JSON.stringify({ target: 42, status: 'verified', findings: [] }),
    );
    await expect(verifySystem('sys-1', [])).rejects.toMatchObject({
      code: 'OUTPUT_SHAPE_INVALID',
    });
  });

  it('rejects null output', async () => {
    mockSystemVerify.mockReturnValue('null');
    await expect(verifySystem('sys-1', [])).rejects.toMatchObject({
      code: 'OUTPUT_SHAPE_INVALID',
    });
  });
});
