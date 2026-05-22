/**
 * bootstrap-contracts.test.ts  (unit/)
 *
 * Tests for WasmLoader singleton invariants and bootstrap state-transition
 * contracts. Covers four oracle-rank groups:
 *
 *   Group 1 — Rank 1 (mathematical):  WasmLoader singleton invariants
 *   Group 2 — Rank 2 (domain contract): Bootstrap state transitions
 *   Group 3 — Rank 2 (domain contract): WasmLoader isolation between tests
 *   Group 4 — Rank 3 (metamorphic):    Error state behavior
 *
 * No real WASM binary is used — bootstrapEngine is mocked identically to
 * recovery-stress.test.ts so these tests run in CI without a compiled binary.
 * WasmLoader.reset() is called in beforeEach to prevent singleton state bleed.
 *
 * FM-5 note: init.js is NOT mocked. The bootstrapEngine function that wraps
 * init.js IS mocked at the module level, which is the approved pattern.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSimpleEngine, createFullEngine } from '../../index.js';
import type { Kernel } from '../../engine.js';
import { WasmLoader } from '../../wasm-loader.js';
import { WasmLoadError, createWasmLoader } from '../../wasm-loader.js';
import { createBootstrapError } from '../../bootstrap.js';

// ── Mock bootstrap so tests run without a compiled WASM binary ────────────────
//
// The mock keeps real module shape (actual spread) and replaces bootstrapEngine
// with a fast stub. This is the same pattern used by recovery-stress.test.ts.

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

// ── Minimal kernel stub ───────────────────────────────────────────────────────

class StubKernel implements Kernel {
  private ready = false;

  async init(): Promise<void> {
    this.ready = true;
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }
}

// ── Group 1: WasmLoader singleton invariants — Rank 1 (mathematical) ─────────
//
// These properties follow from first principles of the singleton pattern.
// They do not derive expected values from the implementation under test (no FM-5).

describe('Group 1 — WasmLoader singleton invariants (Rank 1 mathematical)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('getInstance() called twice returns the SAME object reference', () => {
    const first = WasmLoader.getInstance();
    const second = WasmLoader.getInstance();
    // Referential identity — not deep equality
    expect(first).toBe(second);
  });

  it('getInstance() with config called twice returns the SAME object reference', () => {
    const first = WasmLoader.getInstance({ enablePanicHook: false });
    const second = WasmLoader.getInstance({ enablePanicHook: false });
    expect(first).toBe(second);
  });

  it('after reset(), a new getInstance() call returns a DIFFERENT object reference', () => {
    const before = WasmLoader.getInstance();
    WasmLoader.reset();
    const after = WasmLoader.getInstance();
    // The old reference must not be the same object as the fresh one
    expect(after).not.toBe(before);
  });

  it('after reset(), the new instance is not initialized', () => {
    const loader = WasmLoader.getInstance();
    // Loader is fresh — not initialized yet
    expect(loader.isInitialized()).toBe(false);
  });

  it('reset() can be called multiple times without throwing', () => {
    expect(() => {
      WasmLoader.reset();
      WasmLoader.reset();
      WasmLoader.reset();
    }).not.toThrow();
  });

  it('get() before init() throws with actionable message', () => {
    const loader = WasmLoader.getInstance();
    expect(() => loader.get()).toThrow('not initialized');
  });

  it('isInitialized() returns false on a fresh singleton', () => {
    const loader = WasmLoader.getInstance();
    expect(loader.isInitialized()).toBe(false);
  });

  it('getStatus() before init() reports initialized: false without throwing', () => {
    const loader = WasmLoader.getInstance();
    const status = loader.getStatus();
    expect(status.initialized).toBe(false);
    expect(status.memoryPages).toBe(0);
  });

  it('createWasmLoader() returns the singleton (same reference as getInstance())', () => {
    const via_get = WasmLoader.getInstance();
    const via_factory = createWasmLoader();
    expect(via_factory).toBe(via_get);
  });
});

// ── Group 2: Bootstrap state transitions — Rank 2 (domain contract) ───────────
//
// These properties are design decisions of the wasm4pm engine, derived from the
// Van der Aalst lifecycle doctrine: uninitialized → bootstrapping → ready.

describe('Group 2 — Bootstrap state transitions (Rank 2 domain contract)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('engine starts in "uninitialized" state before bootstrap', () => {
    const engine = createSimpleEngine(new StubKernel());
    expect(engine.state()).toBe('uninitialized');
  });

  it('after successful bootstrap, engine state is "ready"', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    expect(engine.state()).toBe('ready');
  });

  it('after bootstrap, engine.state() is callable and returns a string', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    const s = engine.state();
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('after bootstrap, engine is not in bootstrapping state (transition completed)', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    expect(engine.state()).not.toBe('bootstrapping');
  });

  it('after bootstrap, engine.isReady() returns true', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    expect(engine.isReady()).toBe(true);
  });

  it('after bootstrap, engine.isFailed() returns false', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    expect(engine.isFailed()).toBe(false);
  });

  it('bootstrap is idempotent — calling it twice does not corrupt state', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    expect(engine.state()).toBe('ready');

    // Second call must not crash or leave engine in an invalid state
    // (engine.bootstrap() from ready rejects — the state stays ready, not corrupted)
    try {
      await engine.bootstrap();
    } catch {
      // A second bootstrap from ready throws — that is acceptable per the contract.
      // The critical invariant is that engine.state() is still a valid state.
    }
    const stateAfter = engine.state();
    expect(['ready', 'failed', 'degraded']).toContain(stateAfter);
  });

  it('transition history contains a bootstrapping→ready entry after successful bootstrap', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();

    const history = engine.getTransitionHistory();
    const hasBootstrapToReady = history.some(
      (e) => e.fromState === 'bootstrapping' && e.toState === 'ready'
    );
    expect(hasBootstrapToReady).toBe(true);
  });

  it('transition history contains an uninitialized→bootstrapping entry after bootstrap', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();

    const history = engine.getTransitionHistory();
    const hasUninitToBootstrapping = history.some(
      (e) => e.fromState === 'uninitialized' && e.toState === 'bootstrapping'
    );
    expect(hasUninitToBootstrapping).toBe(true);
  });

  it('transition timestamps are non-decreasing (temporal order preserved)', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();

    const history = engine.getTransitionHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1]!.timestamp.getTime()
      );
    }
  });
});

// ── Group 3: WasmLoader isolation between tests — Rank 2 (domain contract) ────
//
// Tests that WasmLoader.reset() provides clean-slate isolation so that one
// test's singleton state does not leak to the next.

describe('Group 3 — WasmLoader isolation between tests (Rank 2 domain contract)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('reset() followed by getInstance() gives an uninitialized loader', () => {
    // Simulate a previous test having obtained a loader
    const _ = WasmLoader.getInstance();
    WasmLoader.reset();

    const fresh = WasmLoader.getInstance();
    expect(fresh.isInitialized()).toBe(false);
  });

  it('state from one engine does not affect a fresh engine after reset', async () => {
    // Engine A bootstraps and sets state to ready
    const engineA = createSimpleEngine(new StubKernel());
    await engineA.bootstrap();
    expect(engineA.state()).toBe('ready');

    // Reset singleton (simulates test teardown)
    WasmLoader.reset();

    // Engine B gets its own fresh WasmLoader
    const engineB = createSimpleEngine(new StubKernel());
    // Engine B starts uninitialized regardless of engineA's state
    expect(engineB.state()).toBe('uninitialized');
  });

  it('reset() followed by bootstrap produces a clean transition history', async () => {
    // First engine goes through a full lifecycle
    const engineA = createSimpleEngine(new StubKernel());
    await engineA.bootstrap();
    await engineA.degrade({
      code: 'ISOLATION_DEGRADE',
      message: 'isolation test',
      severity: 'warning',
      recoverable: true,
    });
    WasmLoader.reset();

    // Second engine has its own clean history
    const engineB = createSimpleEngine(new StubKernel());
    await engineB.bootstrap();

    const historyB = engineB.getTransitionHistory();
    // Engine B's history must not contain any entry from engine A's degrade
    const hasDegradeEntry = historyB.some((e) => e.toState === 'degraded');
    expect(hasDegradeEntry).toBe(false);
  });

  it('softReset() clears initialized flag without destroying the singleton', () => {
    const loader = WasmLoader.getInstance();
    // softReset clears initialized but keeps the instance
    loader.softReset();
    expect(loader.isInitialized()).toBe(false);
    // Singleton reference is unchanged
    expect(WasmLoader.getInstance()).toBe(loader);
  });
});

// ── Group 4: Error state behavior — Rank 3 (metamorphic) ─────────────────────
//
// Input perturbation → output relation. Directional constraints that hold for
// any correct implementation. No absolute expected values.

describe('Group 4 — Error state behavior (Rank 3 metamorphic)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('engine in degraded state can call engine.state() without throwing', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    await engine.degrade({
      code: 'TEST_DEGRADE',
      message: 'test degradation',
      severity: 'warning',
      recoverable: true,
    });

    // Must not throw
    expect(() => engine.state()).not.toThrow();
    expect(engine.state()).toBe('degraded');
  });

  it('degrade(error) followed by recover() returns engine to a non-failed state', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    await engine.degrade({
      code: 'RECOVER_TEST',
      message: 'test degrade then recover',
      severity: 'warning',
      recoverable: true,
    });
    await engine.recover();

    expect(engine.isFailed()).toBe(false);
    expect(engine.state()).toBe('ready');
  });

  it('degrade → recover leaves engine in "ready" state (symmetric to pre-degrade)', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    const stateBeforeDegrade = engine.state();

    await engine.degrade({
      code: 'SYMMETRY_DEGRADE',
      message: 'symmetry test',
      severity: 'warning',
      recoverable: true,
    });
    await engine.recover();

    // Post-recovery state must equal pre-degrade state (ready = ready)
    expect(engine.state()).toBe(stateBeforeDegrade);
  });

  it('degraded engine has strictly more history entries than freshly-bootstrapped engine', async () => {
    // Freshly bootstrapped engine
    const engineFresh = createSimpleEngine(new StubKernel());
    await engineFresh.bootstrap();
    const lenFresh = engineFresh.getTransitionHistory().length;

    WasmLoader.reset();

    // Engine that also degrades — must have more history entries
    const engineDegraded = createSimpleEngine(new StubKernel());
    await engineDegraded.bootstrap();
    await engineDegraded.degrade({
      code: 'METAMORPHIC_DEGRADE',
      message: 'metamorphic test',
      severity: 'warning',
      recoverable: true,
    });
    const lenDegraded = engineDegraded.getTransitionHistory().length;

    expect(lenDegraded).toBeGreaterThan(lenFresh);
  });

  it('two consecutive degrades from ready — second degrade is a no-op (state stays degraded)', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();

    await engine.degrade({ code: 'D1', message: 'd1', severity: 'warning', recoverable: true });
    expect(engine.state()).toBe('degraded');

    // VALID_TRANSITIONS[degraded] does not include 'degraded', so second degrade is no-op
    await engine.degrade({ code: 'D2', message: 'd2', severity: 'warning', recoverable: true });
    expect(engine.state()).toBe('degraded');
  });
});

// ── Group 5: createBootstrapError — Rank 1 (mathematical) ────────────────────
//
// createBootstrapError is a pure function with well-defined domain contracts.
// These tests verify its mapping from WasmLoadError.loadCause to EngineError.code.

describe('Group 5 — createBootstrapError classification (Rank 1 mathematical)', () => {
  it('maps FILE_NOT_FOUND → code WASM_FILE_NOT_FOUND, recoverable true', () => {
    const err = new WasmLoadError('FILE_NOT_FOUND', 'binary not found', '/path/to/wasm.js');
    const result = createBootstrapError(err);
    expect(result.code).toBe('WASM_FILE_NOT_FOUND');
    expect(result.recoverable).toBe(true);
    expect(result.severity).toBe('fatal');
  });

  it('maps CORRUPT_BINARY → code WASM_CORRUPT_BINARY, recoverable false', () => {
    const err = new WasmLoadError('CORRUPT_BINARY', 'binary is corrupt', '/path/to/wasm.js');
    const result = createBootstrapError(err);
    expect(result.code).toBe('WASM_CORRUPT_BINARY');
    expect(result.recoverable).toBe(false);
  });

  it('maps MISSING_EXPORTS → code WASM_MISSING_EXPORTS, recoverable true', () => {
    const err = new WasmLoadError('MISSING_EXPORTS', 'missing export', '/path/to/wasm.js');
    const result = createBootstrapError(err);
    expect(result.code).toBe('WASM_MISSING_EXPORTS');
    expect(result.recoverable).toBe(true);
  });

  it('maps LOAD_FAILED → code WASM_LOAD_FAILED, recoverable true', () => {
    const err = new WasmLoadError('LOAD_FAILED', 'load failed', '/path/to/wasm.js');
    const result = createBootstrapError(err);
    expect(result.code).toBe('WASM_LOAD_FAILED');
    expect(result.recoverable).toBe(true);
  });

  it('maps generic Error → code BOOTSTRAP_FAILED, recoverable true', () => {
    const err = new Error('something went wrong');
    const result = createBootstrapError(err);
    expect(result.code).toBe('BOOTSTRAP_FAILED');
    expect(result.recoverable).toBe(true);
    expect(result.message).toContain('something went wrong');
  });

  it('maps non-Error value → BOOTSTRAP_FAILED with stringified message', () => {
    const result = createBootstrapError('raw string error');
    expect(result.code).toBe('BOOTSTRAP_FAILED');
    expect(result.message).toContain('raw string error');
  });

  it('all error codes produce a non-empty message', () => {
    const causes: WasmLoadError['loadCause'][] = [
      'FILE_NOT_FOUND',
      'CORRUPT_BINARY',
      'MISSING_EXPORTS',
      'LOAD_FAILED',
    ];
    for (const cause of causes) {
      const err = new WasmLoadError(cause, `test message for ${cause}`);
      const result = createBootstrapError(err);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('all produced EngineErrors have severity "fatal"', () => {
    const wasmErr = new WasmLoadError('FILE_NOT_FOUND', 'not found');
    const genericErr = new Error('generic');
    expect(createBootstrapError(wasmErr).severity).toBe('fatal');
    expect(createBootstrapError(genericErr).severity).toBe('fatal');
  });
});
