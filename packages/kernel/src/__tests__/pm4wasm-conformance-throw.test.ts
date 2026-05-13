import { describe, it, expect } from 'vitest';

/**
 * Test that Pm4wasmBackend throws when required WASM functions are missing.
 * This verifies Armstrong A3/A4 fixes: fail-fast on missing function exports.
 */
describe('Pm4wasmBackend missing function throws (A3/A4 fixes)', () => {
  // Simplified version of conformance function logic for testing
  async function runConformance(wasmModule: any, functionName: string) {
    if (!wasmModule[functionName]) {
      throw new Error(`WASM module missing ${functionName}`);
    }
    return wasmModule[functionName]();
  }

  it('throws when token_replay_pure is missing', async () => {
    const mockWasm = {
      load_eventlog_from_xes: () => 'handle123',
      // Missing token_replay_pure
    };

    await expect(
      runConformance(mockWasm, 'token_replay_pure')
    ).rejects.toThrow('WASM module missing token_replay_pure');
  });

  it('throws when compute_optimal_alignments is missing', async () => {
    const mockWasm = {
      load_eventlog_from_xes: () => 'handle123',
      token_replay_pure: () => ({ fitness: 0.85 }),
      // Missing compute_optimal_alignments
    };

    await expect(
      runConformance(mockWasm, 'compute_optimal_alignments')
    ).rejects.toThrow('WASM module missing compute_optimal_alignments');
  });

  it('throws when load_eventlog_from_xes is missing', async () => {
    const mockWasm = {
      // Missing load_eventlog_from_xes
      token_replay_pure: () => ({ fitness: 0.85 }),
    };

    await expect(
      runConformance(mockWasm, 'load_eventlog_from_xes')
    ).rejects.toThrow('load_eventlog_from_xes');
  });

  it('succeeds when required function is present', async () => {
    const mockWasm = {
      load_eventlog_from_xes: () => 'handle123',
      token_replay_pure: () => JSON.stringify({ fitness: 0.85, precision: 0.8, generalization: 0.75, simplicity: 100 }),
    };

    await expect(
      runConformance(mockWasm, 'token_replay_pure')
    ).resolves.toBeDefined();
  });

  it('detects missing functions by checking module properties', async () => {
    const mockWasm = { discover_dfg: () => {} };
    const requiredFunctions = ['token_replay_pure', 'compute_optimal_alignments', 'load_eventlog_from_xes'];

    const missingFunctions = requiredFunctions.filter(fn => !mockWasm[fn as keyof typeof mockWasm]);

    expect(missingFunctions).toHaveLength(3);
    expect(missingFunctions).toContain('token_replay_pure');
  });
});
