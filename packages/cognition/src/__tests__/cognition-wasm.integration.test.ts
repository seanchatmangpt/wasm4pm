import { describe, it, expect } from 'vitest';
// NO vi.mock('../init.js') — FM-5 compliance. This test MUST fail if pkg/ is deleted.
import * as wasm from 'wasm4pm-cognition';

describe('cognition WASM integration (real binary)', () => {
  it('FM-5 sanity: imports the real WASM module', () => {
    expect(typeof wasm.cognition_run).toBe('function');
  });

  it('cognition_run returns ContractResult with valid hashes', () => {
    // Minimal valid BreedInput for the eliza breed (see
    // crates/wasm4pm-cognition/src/breeds/mod.rs and src/wasm.rs:118-124).
    // BreedInput requires intent/candidates/facts/cases/rules/goals/state.
    // Eliza only requires a non-empty intent.
    const breed = 'eliza';
    const contract = {
      intent: 'integration test',
      candidates: [],
      facts: [],
      cases: [],
      rules: [],
      goals: [],
      state: [],
    };
    const inputJson = JSON.stringify({ breed, contract, options: {} });
    const raw = wasm.cognition_run(inputJson);
    const result = typeof raw === 'string' ? JSON.parse(raw) : raw;

    expect(result.status).toBe('ok');
    expect(result.run_id).toMatch(/^[0-9a-f]{64}$/);
    expect(result.output_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.replay_pointer).toHaveLength(16);
    expect(result.replay_pointer).toBe(result.output_hash.slice(0, 16));
    expect(result.options_profile).toBeNull();
    expect(result.breed).toBe(breed);
  });
});
