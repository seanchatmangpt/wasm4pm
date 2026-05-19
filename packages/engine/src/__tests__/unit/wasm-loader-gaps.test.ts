/**
 * wasm-loader-gaps.test.ts  (unit/)
 *
 * Closes five DX/QoL gaps in wasm-loader and bootstrap logic:
 *
 *   Gap 1 — softReset() preserves compiled module (code fix + test)
 *             softReset() clears `initialized` but keeps `this.module`.
 *             init() must reuse the existing module without re-importing.
 *
 *   Gap 2 — softReset() + re-init skips the cold loadWasmModule() path
 *             After softReset(), calling init() again must succeed and set
 *             isInitialized() to true using the cached module.
 *
 *   Gap 3 — bootstrap(timeoutMs) parameter fires a timeout on hung WASM
 *             bootstrap() accepts a configurable timeout.  A deliberately
 *             slow kernel must trigger the timeout and leave the engine in
 *             a non-ready state.
 *
 *   Gap 4 — isInitialized() false → true transition driven by init()
 *             No existing test drives the loader from false to true via
 *             an injected module path (without real WASM binary).
 *
 *   Gap 5 — WasmLoader.get() message contains actionable path info
 *             The error thrown by get() before init() must include the
 *             string "init()" to guide the caller.
 *
 * All tests run without a compiled WASM binary.  bootstrapEngine is mocked
 * at the module level using the approved pattern.  WasmLoader.reset() is
 * called in beforeEach to prevent singleton bleed.
 *
 * Oracle ranks:
 *   Rank 1 — mathematical / structural invariants
 *   Rank 2 — domain contracts (lifecycle semantics)
 *   Rank 3 — metamorphic (perturbation → directional output relation)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WasmLoader, WasmModule } from '../../wasm-loader.js';
import { createSimpleEngine } from '../../index.js';
import type { Kernel } from '../../engine.js';

// ── Mock bootstrapEngine so tests run without real WASM ───────────────────────

vi.mock('../../bootstrap.js', async () => {
  const actual = await vi.importActual<typeof import('../../bootstrap.js')>('../../bootstrap.js');
  return {
    ...actual,
    bootstrapEngine: vi.fn(async (kernel: any, _wasmLoader: any) => {
      await kernel.init();
      if (!kernel.isReady()) {
        throw new Error('Kernel initialization failed: kernel not ready');
      }
      return {
        wasmModule: { memory: { buffer: new ArrayBuffer(1024), maximum: 256 } },
        durationMs: 2,
      };
    }),
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Minimal WasmModule implementation used to inject a pre-loaded module
 * into WasmLoader without a real WASM binary on disk.
 */
function makeTestModule(): WasmModule {
  return {
    memory: { buffer: new ArrayBuffer(256 * 64 * 1024) },
    load_eventlog_from_xes: () => 'test-handle',
  } as unknown as WasmModule;
}

/**
 * Kernel stub that succeeds immediately.
 */
class StubKernel implements Kernel {
  private ready = false;
  initCallCount = 0;

  async init(): Promise<void> {
    this.initCallCount++;
    this.ready = true;
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }
}

/**
 * Kernel that never resolves — used to exercise bootstrap timeout.
 */
class HungKernel implements Kernel {
  async init(): Promise<void> {
    await new Promise<never>(() => {
      /* intentionally never resolves */
    });
  }

  async shutdown(): Promise<void> {
    /* no-op */
  }

  isReady(): boolean {
    return false;
  }
}

// ── Gap 1 — softReset() preserves compiled module reference (Rank 1) ─────────
//
// The invariant: after softReset(), this.module must still point to the same
// object it pointed to before.  WasmLoader does not expose a public module
// accessor, so we verify the preservation indirectly:
//   (a) inject a module via the internal path (hacky but necessary without real WASM)
//   (b) call softReset()
//   (c) verify that init() does NOT re-import (it fast-reinits and sets initialized=true)

describe('Gap 1 — softReset() preserves compiled module (Rank 1 structural)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('softReset() clears initialized without touching the module slot', () => {
    const loader = WasmLoader.getInstance();

    // Inject a test module directly into the private slot via type coercion.
    // This simulates the state after a successful init() call.
    const testModule = makeTestModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).initialized = true;

    expect(loader.isInitialized()).toBe(true);

    // softReset clears initialized...
    loader.softReset();
    expect(loader.isInitialized()).toBe(false);

    // ...but the module slot is still populated
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((loader as any).module).toBe(testModule);
  });

  it('after softReset(), get() throws until init() is called again', () => {
    const loader = WasmLoader.getInstance();

    // Inject pre-loaded module
    const testModule = makeTestModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).initialized = true;

    loader.softReset();

    // get() must throw — not initialized yet
    expect(() => loader.get()).toThrow();
  });

  it('get() throws before init() with a message containing "init()"', () => {
    const loader = WasmLoader.getInstance();
    // Gap 5 also covered here: the actionable hint must mention init()
    expect(() => loader.get()).toThrow(/init\(\)/i);
  });
});

// ── Gap 2 — softReset() + re-init reuses cached module (Rank 2 domain contract) ─
//
// Design contract: softReset() is the fast recovery path.  A subsequent
// init() call must skip loadWasmModule() and immediately set initialized=true.

describe('Gap 2 — softReset() + re-init reuses cached module (Rank 2 domain)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('after softReset(), re-calling init() sets isInitialized() to true', async () => {
    const loader = WasmLoader.getInstance();

    // Inject a module to simulate post-bootstrap state
    const testModule = makeTestModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).initialized = true;

    loader.softReset();
    expect(loader.isInitialized()).toBe(false);

    // init() must succeed without trying to dynamically import a file
    // (because this.module is already populated)
    await loader.init();

    expect(loader.isInitialized()).toBe(true);
  });

  it('after softReset() + re-init, get() returns the same module object (no re-import)', async () => {
    const loader = WasmLoader.getInstance();

    const testModule = makeTestModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).initialized = true;

    loader.softReset();
    await loader.init();

    // The module returned must be the same object — not a freshly-imported one
    const retrieved = loader.get();
    expect(retrieved).toBe(testModule);
  });

  it('isInitialized() transitions false→true across softReset + re-init', async () => {
    const loader = WasmLoader.getInstance();

    // Inject a pre-loaded module
    const testModule = makeTestModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).initialized = true;

    // Force false
    loader.softReset();
    const before = loader.isInitialized();
    expect(before).toBe(false);

    // Force back to true without loading from disk
    await loader.init();
    const after = loader.isInitialized();
    expect(after).toBe(true);

    // Metamorphic: before < after (false → true)
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  it('getStatus().initialized matches isInitialized() at every step', async () => {
    const loader = WasmLoader.getInstance();

    const testModule = makeTestModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).initialized = true;

    // After softReset: both report false
    loader.softReset();
    expect(loader.isInitialized()).toBe(loader.getStatus().initialized);

    // After re-init: both report true
    await loader.init();
    expect(loader.isInitialized()).toBe(loader.getStatus().initialized);
    expect(loader.isInitialized()).toBe(true);
  });
});

// ── Gap 3 — bootstrap(timeoutMs) parameter fires correctly (Rank 2 domain) ────
//
// bootstrap() accepts a configurable timeout.  Passing a very small value (1ms)
// against a HungKernel must cause the engine to exit the bootstrapping state
// within a reasonable wall-clock window.

describe('Gap 3 — bootstrap(timeoutMs) timeout parameter (Rank 2 domain)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('bootstrap(1) against a never-resolving kernel rejects within 500ms', async () => {
    const engine = createSimpleEngine(new HungKernel());

    const start = Date.now();
    let caught = false;
    try {
      await engine.bootstrap(1); // 1 ms timeout
    } catch {
      caught = true;
    }
    const elapsed = Date.now() - start;

    expect(caught).toBe(true);
    // Should reject well before 500ms (not wait for the default 30s)
    expect(elapsed).toBeLessThan(500);
  }, 1000 /* test timeout: 1s */);

  it('bootstrap(1) leaves engine in a non-ready state', async () => {
    const engine = createSimpleEngine(new HungKernel());

    try {
      await engine.bootstrap(1);
    } catch {
      // expected
    }

    expect(engine.state()).not.toBe('ready');
    expect(engine.state()).not.toBe('uninitialized');
  }, 1000);

  it('bootstrap(1) leaves engine in degraded or failed state', async () => {
    const engine = createSimpleEngine(new HungKernel());

    try {
      await engine.bootstrap(1);
    } catch {
      // expected
    }

    expect(['degraded', 'failed']).toContain(engine.state());
  }, 1000);

  it('bootstrap(1) error is recorded in engine status', async () => {
    const engine = createSimpleEngine(new HungKernel());

    try {
      await engine.bootstrap(1);
    } catch {
      // expected
    }

    const status = engine.status();
    expect(status.errors.length).toBeGreaterThan(0);
  }, 1000);

  it('bootstrap with 30s default does NOT time out for a fast kernel', async () => {
    // Regression: default timeout must not be accidentally small
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap(); // default timeoutMs
    expect(engine.state()).toBe('ready');
  });
});

// ── Gap 4 — isInitialized() false→true without real WASM (Rank 2 domain) ─────
//
// The existing wasm-loader.test.ts only tests the false side.  This group
// tests the full false→true transition driven by the WasmLoader API itself,
// not just by checking the initial state.

describe('Gap 4 — isInitialized() false→true transition (Rank 2 domain)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('fresh loader starts false', () => {
    expect(WasmLoader.getInstance().isInitialized()).toBe(false);
  });

  it('after reset(), new instance is false (not true)', () => {
    const loader = WasmLoader.getInstance();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).initialized = true; // simulate a previously initialized state
    WasmLoader.reset();
    expect(WasmLoader.getInstance().isInitialized()).toBe(false);
  });

  it('injecting a module and calling init() produces isInitialized() === true', async () => {
    const loader = WasmLoader.getInstance();
    const testModule = makeTestModule();

    // Pre-populate module to enable the fast-path in init()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;

    expect(loader.isInitialized()).toBe(false); // starts false
    await loader.init();
    expect(loader.isInitialized()).toBe(true); // ends true
  });

  it('multiple init() calls after the first are idempotent (initialized stays true)', async () => {
    const loader = WasmLoader.getInstance();
    const testModule = makeTestModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;

    await loader.init();
    expect(loader.isInitialized()).toBe(true);

    // Calling init() again must not throw and must keep initialized=true
    await loader.init();
    expect(loader.isInitialized()).toBe(true);
  });

  it('reset() after init() restores false (Rank 1 inverse property)', async () => {
    const loader = WasmLoader.getInstance();
    const testModule = makeTestModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;
    await loader.init();
    expect(loader.isInitialized()).toBe(true);

    WasmLoader.reset();

    // A brand-new instance must start false
    expect(WasmLoader.getInstance().isInitialized()).toBe(false);
  });
});

// ── Gap 5 — get() error message quality (Rank 2 domain) ──────────────────────
//
// The error thrown by get() before init() must be actionable.  It must contain
// "init()" so the caller understands what to do next.

describe('Gap 5 — get() error message quality (Rank 2 domain)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('get() throws before init() with a message mentioning init()', () => {
    const loader = WasmLoader.getInstance();
    let message = '';
    try {
      loader.get();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message.length).toBeGreaterThan(0);
    expect(message.toLowerCase()).toMatch(/init\(\)/);
  });

  it('get() error is an instance of Error (not a raw string)', () => {
    const loader = WasmLoader.getInstance();
    let thrown: unknown;
    try {
      loader.get();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
  });

  it('get() after init() does NOT throw', async () => {
    const loader = WasmLoader.getInstance();
    const testModule = makeTestModule();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = testModule;
    await loader.init();

    expect(() => loader.get()).not.toThrow();
  });

  it('getStatus() before init() does not throw and reports initialized: false', () => {
    const loader = WasmLoader.getInstance();
    let status: ReturnType<typeof loader.getStatus> | undefined;
    expect(() => {
      status = loader.getStatus();
    }).not.toThrow();
    expect(status?.initialized).toBe(false);
  });
});
