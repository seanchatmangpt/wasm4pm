/**
 * field-contract-sentinel.integration.test.ts
 *
 * FM-5 sentinel for the __tests__/unit/ directory.
 *
 * The cognition-test-gate hook requires that at least one file in every
 * __tests__/ directory does NOT mock init.js. Without this sentinel, every
 * file in unit/ mocks init.js, which means deleting the real WASM binary
 * would not cause any test here to fail — a FM-5 (self-referential
 * falsification) violation.
 *
 * This file imports directly from the real WASM package WITHOUT mocking.
 * If the WASM binary is absent, this test fails with ERR_MODULE_NOT_FOUND,
 * which is the correct signal: "the unit tests in this directory are
 * not grounded against a real binary."
 *
 * Oracle rank: Rank 2 (Domain contract — real WASM shape is reachable).
 * NO vi.mock — FM-5 compliant.
 */

import { describe, it, expect } from 'vitest';
// Direct import with no mock — intentionally exercises the real module resolution
import * as wasmCognition from 'wasm4pm-cognition';

describe('FM-5 sentinel: real WASM module is reachable from unit/ directory', () => {
  it('wasm4pm-cognition exports cognition_run as a function', () => {
    // If pkg/ does not exist, this test fails at import time with ERR_MODULE_NOT_FOUND.
    // That is the desired behavior: it proves the unit tests in this directory are
    // grounded against a real binary, not just fabricated mocks.
    expect(typeof wasmCognition.cognition_run).toBe('function');
  });

  it('cognition_run output shape matches ContractResult contract (status=ok, run_id, output_hash)', () => {
    // Minimal eliza invocation — mirrors cognition-wasm.integration.test.ts
    const breed = 'eliza';
    const contract = {
      intent: 'FM-5 sentinel check',
      candidates: [],
      facts: [],
      cases: [],
      rules: [],
      goals: [],
      state: [],
    };
    const raw = wasmCognition.cognition_run(JSON.stringify({ breed, contract }));
    const result = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // These assertions verify the exact field names declared in cognition-contracts.md.
    // A fabricated mock could pass these even without the binary; the real WASM cannot
    // be deleted without this test failing first.
    expect(result.status).toBe('ok');
    expect(typeof result.run_id).toBe('string');
    expect(typeof result.output_hash).toBe('string');
    expect(typeof result.replay_pointer).toBe('string');
    expect('options_profile' in result).toBe(true);
  });
});
