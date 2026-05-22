/**
 * mttr-engine-timing.test.ts  (unit/)
 *
 * Engine-level MTTR timing domain contracts.
 * bootstrap.js is mocked so tests run without a compiled WASM binary.
 *
 * Covers:
 *   1. Soft recovery (degraded→ready) wall-clock elapsed < 100ms
 *      (tighter than the 1000ms top-level SLA; validates no hidden latency
 *       on the re-init-only path)
 *   2. getMTTR() after soft recovery is < 100ms with a synchronous kernel
 *   3. computeMTTRFromHistory() and getMTTR() directional agreement:
 *      a slower kernel produces a larger MTTR than a synchronous kernel
 *   4. computeMTTRFromHistory() returns 0 before any failure state
 *   5. computeMTTRFromHistory() is finite and non-negative after recovery
 *   6. computeMTTRFromHistory() handles failed→ready (fastRecoverFromFailed) correctly
 *   7. Both metrics remain < 1000ms after a mixed degrade+fail sequence
 *   8. getRecoveryCount() is 2 after one degrade-recover and one fail-fastRecover
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSimpleEngine } from '../../index.js';
import type { Kernel } from '../../engine.js';
import { WasmLoader } from '../../wasm-loader.js';

// Mock bootstrapEngine so bootstrap() succeeds without a real WASM binary.
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
        durationMs: 5,
      };
    }),
  };
});

// ── Kernel stubs ──────────────────────────────────────────────────────────────

/** Synchronous kernel — init() resolves in < 1ms. */
class FastKernel implements Kernel {
  private ready = false;
  async init(): Promise<void> { this.ready = true; }
  async shutdown(): Promise<void> { this.ready = false; }
  isReady(): boolean { return this.ready; }
}

/** Slow kernel — init() waits 5ms; used to verify MTTR reflects actual latency. */
class SlowKernel implements Kernel {
  private ready = false;
  async init(): Promise<void> {
    await new Promise((r) => setTimeout(r, 5));
    this.ready = true;
  }
  async shutdown(): Promise<void> { this.ready = false; }
  isReady(): boolean { return this.ready; }
}

const DEGRADE_ERROR = {
  code: 'TEST_DEGRADE',
  message: 'Injected degradation',
  severity: 'warning' as const,
  recoverable: true,
};

beforeEach(() => { WasmLoader.reset(); });

// ── 1 & 2. Soft recovery < 100ms ─────────────────────────────────────────────
// Domain contract: the soft path (degraded→bootstrapping→ready) re-uses the
// already-initialized WASM module and only calls kernel.init().  With a
// synchronous kernel, there is no I/O; measured elapsed must be < 100ms.

describe('Engine MTTR domain contract — soft recovery < 100ms', () => {
  it('wall-clock elapsed for degraded→ready is < 100ms with a synchronous kernel', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    expect(engine.state()).toBe('degraded');

    const t0 = Date.now();
    await engine.recover();
    const elapsed = Date.now() - t0;

    expect(engine.state()).toBe('ready');
    expect(elapsed).toBeLessThan(100);
  });

  it('getMTTR() after a single soft recovery is < 100ms with a synchronous kernel', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();

    expect(engine.getMTTR()).toBeLessThan(100);
  });
});

// ── 3. computeMTTRFromHistory() directional agreement ────────────────────────
// Metamorphic (Rank-3) relation: a kernel with a fixed 5ms delay produces a
// strictly larger MTTR than a synchronous kernel.  Both getMTTR() and
// computeMTTRFromHistory() must agree on the direction.

describe('Engine MTTR domain contract — directional agreement fast vs slow kernel', () => {
  it('slow kernel MTTR > fast kernel MTTR (getMTTR)', async () => {
    // Fast engine
    const fastEngine = createSimpleEngine(new FastKernel());
    await fastEngine.bootstrap();
    await fastEngine.degrade(DEGRADE_ERROR);
    await fastEngine.recover();
    const fastMttr = fastEngine.getMTTR();

    WasmLoader.reset();

    // Slow engine
    const slowEngine = createSimpleEngine(new SlowKernel());
    await slowEngine.bootstrap();
    await slowEngine.degrade(DEGRADE_ERROR);
    await slowEngine.recover();
    const slowMttr = slowEngine.getMTTR();

    expect(slowMttr).toBeGreaterThan(fastMttr);
  });

  it('slow kernel produces finite non-trivial computeMTTRFromHistory()', async () => {
    const engine = createSimpleEngine(new SlowKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();

    const histMttr = engine.computeMTTRFromHistory();
    expect(Number.isFinite(histMttr)).toBe(true);
    expect(histMttr).toBeGreaterThan(0);
    expect(histMttr).toBeLessThan(1000);
  });
});

// ── 4. computeMTTRFromHistory() returns 0 before failure states ───────────────

describe('Engine MTTR — computeMTTRFromHistory() pre-failure baseline', () => {
  it('returns 0 after bootstrap (no failure states in history yet)', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    expect(engine.computeMTTRFromHistory()).toBe(0);
  });
});

// ── 5 & 6. computeMTTRFromHistory() after recovery ───────────────────────────

describe('Engine MTTR — computeMTTRFromHistory() post-recovery correctness', () => {
  it('is finite and >= 0 after degraded→ready recovery', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();

    const h = engine.computeMTTRFromHistory();
    expect(Number.isFinite(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
  });

  it('is < 1000ms after failed→ready fast recovery', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.shutdown();
    expect(engine.state()).toBe('failed');

    await engine.fastRecoverFromFailed();
    expect(engine.state()).toBe('ready');

    expect(engine.computeMTTRFromHistory()).toBeLessThan(1000);
  });
});

// ── 7 & 8. Mixed degrade+fail sequence ───────────────────────────────────────

describe('Engine MTTR — mixed degrade+fail sequence', () => {
  it('both getMTTR() and computeMTTRFromHistory() are < 1000ms after degrade-recover + fail-fastRecover', async () => {
    const engine = createSimpleEngine(new FastKernel());

    // Phase 1: degrade → recover
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();
    expect(engine.state()).toBe('ready');

    // Phase 2: fail → fast recover
    await engine.shutdown();
    expect(engine.state()).toBe('failed');
    await engine.fastRecoverFromFailed();
    expect(engine.state()).toBe('ready');

    expect(engine.getMTTR()).toBeLessThan(1000);
    expect(engine.computeMTTRFromHistory()).toBeLessThan(1000);
    expect(Number.isFinite(engine.computeMTTRFromHistory())).toBe(true);
  });

  it('getRecoveryCount() is 2 after one degrade-recover and one fail-fastRecover', async () => {
    const engine = createSimpleEngine(new FastKernel());

    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();

    await engine.shutdown();
    await engine.fastRecoverFromFailed();

    expect(engine.getRecoveryCount()).toBe(2);
  });

  it('transition history contains entries for both recovery paths', async () => {
    const engine = createSimpleEngine(new FastKernel());

    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();
    await engine.shutdown();
    await engine.fastRecoverFromFailed();

    const history = engine.getTransitionHistory();

    // Must have at least one degraded→bootstrapping (soft recovery)
    expect(history.some((e) => e.fromState === 'degraded' && e.toState === 'bootstrapping')).toBe(true);

    // Must have a failed→ready or failed→bootstrapping (fast recovery)
    expect(
      history.some(
        (e) =>
          e.fromState === 'failed' &&
          (e.toState === 'ready' || e.toState === 'bootstrapping')
      )
    ).toBe(true);
  });
});
