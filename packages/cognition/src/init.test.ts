import { afterEach, describe, expect, it } from 'vitest';
import { CognitionError } from './errors.js';
import { WasmLoader, type CognitionWasmModule } from './init.js';

const REAL_EXPORTS: CognitionWasmModule = {
  cognition_show: () => '{}',
  cognition_run: () => '{}',
  cognition_session_turn: () => '{}',
  cognition_session_verify: () => '{}',
  cognition_session_code: () => '{}',
  cognition_verify: () => '{}',
  cognition_replay: () => '{}',
  system_build: () => '{}',
  system_verify: () => '{}',
};

afterEach(() => {
  WasmLoader.reset();
});

describe('WasmLoader bootstrap', () => {
  it('refuses to serve a module before init() has run (cold start)', () => {
    const loader = WasmLoader.getInstance({
      moduleLoader: async () => REAL_EXPORTS,
    });

    expect(loader.isInitialized()).toBe(false);
    expect(() => loader.get()).toThrow(CognitionError);
    try {
      loader.get();
      throw new Error('expected WASM_INIT_FAILED');
    } catch (error) {
      expect(error).toMatchObject({ code: 'WASM_INIT_FAILED' });
    }
  });

  it('initializes and serves the module once init() resolves', async () => {
    const loader = WasmLoader.getInstance({
      moduleLoader: async () => REAL_EXPORTS,
    });

    await loader.init();

    expect(loader.isInitialized()).toBe(true);
    expect(loader.get()).toBe(REAL_EXPORTS);
  });

  it('rejects a loaded module missing required exports rather than admitting a partial shape', async () => {
    const loader = WasmLoader.getInstance({
      moduleLoader: async () => ({ cognition_show: () => '{}' }),
    });

    await expect(loader.init()).rejects.toMatchObject({ code: 'WASM_INIT_FAILED' });
    expect(loader.isInitialized()).toBe(false);
    expect(() => loader.get()).toThrow(CognitionError);
  });

  it('concurrent init() calls await the same in-flight initialization exactly once', async () => {
    let loadCount = 0;
    const loader = WasmLoader.getInstance({
      moduleLoader: async () => {
        loadCount += 1;
        return REAL_EXPORTS;
      },
    });

    await Promise.all([loader.init(), loader.init(), loader.init()]);

    expect(loadCount).toBe(1);
    expect(loader.isInitialized()).toBe(true);
  });

  it('a second init() after success is a no-op (idempotent, does not reload)', async () => {
    let loadCount = 0;
    const loader = WasmLoader.getInstance({
      moduleLoader: async () => {
        loadCount += 1;
        return REAL_EXPORTS;
      },
    });

    await loader.init();
    await loader.init();

    expect(loadCount).toBe(1);
  });

  it('a failed init() can be retried after WasmLoader.reset()', async () => {
    const failing = WasmLoader.getInstance({
      moduleLoader: async () => ({ cognition_show: () => '{}' }),
    });
    await expect(failing.init()).rejects.toBeInstanceOf(CognitionError);

    WasmLoader.reset();

    const recovered = WasmLoader.getInstance({
      moduleLoader: async () => REAL_EXPORTS,
    });
    await recovered.init();

    expect(recovered.isInitialized()).toBe(true);
  });
});
