/**
 * validation-opt-out.test.ts
 *
 * Verifies WASM4PM_SKIP_ZOD opt-out behaviour.
 * The module-level constant (ZOD_VALIDATION_ENABLED) is frozen at import time,
 * so in-process tests cover the default ON case. The OFF case is verified via
 * the manual integration script at scripts/verify-skip-zod.mjs.
 */

import { describe, it, expect } from 'vitest';
import { validateWasmPayload } from '../zod-validators.js';
import { ZOD_VALIDATION_ENABLED } from '../validation-config.js';

describe('Zod validation opt-out (WASM4PM_SKIP_ZOD)', () => {
  it('validation is ON by default (WASM4PM_SKIP_ZOD not set in test env)', () => {
    expect(ZOD_VALIDATION_ENABLED).toBe(true);
  });

  it('validateWasmPayload throws on malformed inductive_miner payload', () => {
    expect(() =>
      validateWasmPayload('inductive_miner', { bad: 'payload' }),
    ).toThrow(/schema violation/i);
  });

  it('validateWasmPayload accepts a well-formed inductive_miner payload', () => {
    const good = {
      algorithm: 'inductive_miner',
      root: { node_type: 'sequence', children: [] },
      nodes: 0,
    };
    expect(() => validateWasmPayload('inductive_miner', good)).not.toThrow();
  });

  it('validateWasmPayload is a no-op for unknown algorithm IDs', () => {
    expect(() => validateWasmPayload('unknown_algo', { anything: true })).not.toThrow();
  });
});
