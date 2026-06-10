import { describe, it, expect, beforeAll } from 'vitest';
import { WasmLoader } from '@wasm4pm/engine';

describe('load_powl_from_string — integration (real WASM)', () => {
  let wasm: any;

  beforeAll(async () => {
    const loader = WasmLoader.getInstance();
    await loader.init();
    wasm = loader.get();
  });

  it('loads a POWL v1 SEQ model', async () => {
    const result = JSON.parse(wasm.load_powl_from_string('SEQ(A, B, C)'));
    expect(result).toHaveProperty('handle');
    expect(result.version).toBe('v1');
  });

  it('loads a POWL v1 XOR choice model', async () => {
    const result = JSON.parse(wasm.load_powl_from_string('X(A, B)'));
    expect(result.handle).toBeTruthy();
  });

  it('result has node_count >= 1 for SEQ(A, B, C)', async () => {
    const result = JSON.parse(wasm.load_powl_from_string('SEQ(A, B, C)'));
    expect(result.node_count).toBeGreaterThanOrEqual(1);
  });
});

describe('load_powl_v2_from_string — integration (real WASM)', () => {
  let wasm: any;

  beforeAll(async () => {
    const loader = WasmLoader.getInstance();
    await loader.init();
    wasm = loader.get();
  });

  it('loads a POWL v2 Activity node', async () => {
    const result = JSON.parse(wasm.load_powl_v2_from_string('Activity(a1, "RegisterOrder")'));
    expect(result).toHaveProperty('handle');
    expect(result.version).toBe('v2');
  });
});
