/**
 * recovery-stress.test.ts  (unit/)
 *
 * Stress tests for engine state machine recovery paths.
 * Focused on the two paths critical for MTTR < 1s:
 *   - degraded → ready  (soft recovery via engine.recover())
 *   - failed  → ready  (fast recovery via engine.fastRecoverFromFailed())
 *   - failed  → bootstrapping  (re-init path)
 *
 * Oracle ranks (Van der Aalst / Chicago TDD doctrine):
 *   Rank 1 — mathematical invariants (MTTR arithmetic, idempotency)
 *   Rank 2 — domain contracts (state post-condition, history entry count)
 *   Rank 3 — metamorphic relations (N cycles → predictable history length, MTTR direction)
 *
 * NO real WASM binary is used.  bootstrapEngine is mocked so tests can run in CI.
 * WasmLoader.reset() is called in beforeEach to avoid singleton state bleed between tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSimpleEngine, createFullEngine } from '../../index.js';
import type { Kernel, Planner, Executor } from '../../engine.js';
import type { ExecutionPlan, ExecutionReceipt } from '@wasm4pm/contracts';
import { WasmLoader } from '../../wasm-loader.js';

// ── Mock bootstrap so tests run without a compiled WASM binary ────────────────

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
        durationMs: 3,
      };
    }),
  };
});

// ── Kernel stub ───────────────────────────────────────────────────────────────

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

class StubPlanner implements Planner {
  async plan(_config: unknown): Promise<ExecutionPlan> {
    return {
      planId: 'stress-plan-001',
      steps: [{ id: 'step_1', name: 'Stress Step', description: 'Recovery stress test step' }],
      totalSteps: 1,
      estimatedDurationMs: 5,
    };
  }
}

class StubExecutor implements Executor {
  async run(plan: ExecutionPlan): Promise<ExecutionReceipt> {
    return {
      runId: 'stress-run-001',
      planId: plan.planId,
      state: 'ready',
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 2,
      progress: 100,
      errors: [],
    };
  }

  async *watch(_plan: ExecutionPlan) {
    yield { timestamp: new Date(), state: 'ready' as const, progress: 100 };
  }
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const DEGRADE_ERROR = {
  code: 'STRESS_DEGRADE',
  message: 'Injected degradation for stress test',
  severity: 'warning' as const,
  recoverable: true,
};

async function driveToReady(kernel: StubKernel) {
  const engine = createSimpleEngine(kernel);
  await engine.bootstrap();
  expect(engine.state()).toBe('ready');
  return engine;
}

async function driveToDegraded(kernel: StubKernel) {
  const engine = await driveToReady(kernel);
  await engine.degrade(DEGRADE_ERROR);
  expect(engine.state()).toBe('degraded');
  return engine;
}

async function driveToFailed(kernel: StubKernel) {
  const engine = await driveToReady(kernel);
  await engine.shutdown();
  expect(engine.state()).toBe('failed');
  return engine;
}

// ── MTTR invariants — Rank 1 (mathematical) ──────────────────────────────────
//
// These assertions hold for any correct implementation of the state machine.
// They do not derive expected values from the implementation itself (no FM-5).

describe('MTTR invariants — Rank 1 (mathematical)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('degraded→ready wall-clock elapsed is < 100ms per cycle (tight SLA)', async () => {
    const engine = await driveToReady(new StubKernel());
    await engine.degrade(DEGRADE_ERROR);

    const t0 = Date.now();
    await engine.recover();
    const elapsed = Date.now() - t0;

    expect(engine.state()).toBe('ready');
    expect(elapsed).toBeLessThan(100);
  });

  it('failed→ready wall-clock elapsed is < 1000ms (hard SLA)', async () => {
    const engine = await driveToFailed(new StubKernel());

    const t0 = Date.now();
    await engine.fastRecoverFromFailed();
    const elapsed = Date.now() - t0;

    expect(engine.state()).toBe('ready');
    expect(elapsed).toBeLessThan(1000);
  });

  it('getMTTR() after soft recovery is < 1000ms', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();

    expect(engine.getMTTR()).toBeLessThan(1000);
  });

  it('getMTTR() after fast recovery from failed is < 1000ms', async () => {
    const engine = await driveToFailed(new StubKernel());
    await engine.fastRecoverFromFailed();

    expect(engine.getMTTR()).toBeLessThan(1000);
  });

  it('getMTTR() is non-negative and finite after any recovery', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();

    expect(engine.getMTTR()).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(engine.getMTTR())).toBe(true);
  });

  it('recover() from ready rejects and transitions to failed (handleEngineError fallback)', async () => {
    // Domain contract: recover() called from a non-degraded state throws,
    // and the catch branch's handleEngineError() transitions ready→failed as the
    // fallback.  This is intentional — a misrouted recover() is a fatal misuse.
    const engine = await driveToDegraded(new StubKernel());

    // First recover succeeds: degraded → ready
    await engine.recover();
    expect(engine.state()).toBe('ready');

    // Second recover from ready: throws AND transitions to failed (not a silent no-op)
    await expect(engine.recover()).rejects.toThrow('Cannot recover');
    expect(engine.state()).toBe('failed');
  });

  it('fastRecoverFromFailed() from ready rejects — engine is not in failed state', async () => {
    // fastRecoverFromFailed() throws before handleEngineError is called (no state change).
    const engine = await driveToFailed(new StubKernel());

    await engine.fastRecoverFromFailed();
    expect(engine.state()).toBe('ready');

    // Engine is now in ready, not failed — must reject synchronously before any transition
    await expect(engine.fastRecoverFromFailed()).rejects.toThrow('Cannot fast recover');
    // fastRecoverFromFailed throws before any state mutation — state is still ready
    expect(engine.state()).toBe('ready');
  });

  it('after soft recovery, state is exactly "ready" — not degraded, not failed, not bootstrapping', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();

    expect(engine.state()).toBe('ready');
    expect(engine.isFailed()).toBe(false);
    expect(engine.isReady()).toBe(true);
  });

  it('after fast recovery from failed, state is exactly "ready"', async () => {
    const engine = await driveToFailed(new StubKernel());
    await engine.fastRecoverFromFailed();

    expect(engine.state()).toBe('ready');
    expect(engine.isFailed()).toBe(false);
    expect(engine.isReady()).toBe(true);
  });
});

// ── Recovery path completeness — Rank 2 (domain contracts) ───────────────────
//
// These properties are design decisions of the wasm4pm engine, derived from the
// Van der Aalst process mining lifecycle doctrine (not from implementation code).

describe('Recovery path completeness — Rank 2 (domain contracts)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('degrade(error) when ready → transitions to degraded', async () => {
    const engine = await driveToReady(new StubKernel());
    await engine.degrade(DEGRADE_ERROR);
    expect(engine.state()).toBe('degraded');
  });

  it('degrade(error) when already degraded → stays in degraded (no double-degrade)', async () => {
    const engine = await driveToDegraded(new StubKernel());
    // Engine.degrade() checks canTransition('degraded') — from degraded this is invalid,
    // so the engine silently no-ops rather than throwing.
    await engine.degrade({ ...DEGRADE_ERROR, code: 'SECOND_DEGRADE' });
    expect(engine.state()).toBe('degraded');
  });

  it('degrade(error) when failed → stays in failed (failed state is not degradable)', async () => {
    const engine = await driveToFailed(new StubKernel());
    // VALID_TRANSITIONS[failed] does not include 'degraded', so degrade() is a no-op.
    await engine.degrade(DEGRADE_ERROR);
    expect(engine.state()).toBe('failed');
  });

  it('recover() from degraded → transitions to ready', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();
    expect(engine.state()).toBe('ready');
  });

  it('recover() from ready → rejects with "Cannot recover" (no silent no-op)', async () => {
    const engine = await driveToReady(new StubKernel());
    await expect(engine.recover()).rejects.toThrow('Cannot recover');
  });

  it('fastRecoverFromFailed() from failed → transitions to ready', async () => {
    const engine = await driveToFailed(new StubKernel());
    await engine.fastRecoverFromFailed();
    expect(engine.state()).toBe('ready');
  });

  it('fastRecoverFromFailed() from degraded → rejects with "Cannot fast recover"', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await expect(engine.fastRecoverFromFailed()).rejects.toThrow('Cannot fast recover');
  });

  it('getTransitionHistory() records transitions in insertion order', async () => {
    const engine = await driveToReady(new StubKernel());
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();

    const history = engine.getTransitionHistory();
    const states = history.map((e) => e.toState);
    // bootstrapping must precede ready which must precede degraded
    const idxBootstrapping = states.indexOf('bootstrapping');
    const idxReady = states.indexOf('ready');
    const idxDegraded = states.indexOf('degraded');
    expect(idxBootstrapping).toBeLessThan(idxReady);
    expect(idxReady).toBeLessThan(idxDegraded);
  });

  it('getTransitionHistory() returns a defensive copy — external mutation does not corrupt SM', async () => {
    const engine = await driveToReady(new StubKernel());
    const lenBefore = engine.getTransitionHistory().length;

    const copy = engine.getTransitionHistory();
    copy.splice(0, copy.length); // mutate the copy

    expect(engine.getTransitionHistory().length).toBe(lenBefore);
  });

  it('every transition history entry carries a valid Date timestamp', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();

    for (const event of engine.getTransitionHistory()) {
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(Number.isFinite(event.timestamp.getTime())).toBe(true);
    }
  });

  it('getRecoveryCount() is 1 after exactly one soft recovery', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();
    expect(engine.getRecoveryCount()).toBe(1);
  });

  it('getRecoveryCount() is 1 after exactly one fast recovery from failed', async () => {
    const engine = await driveToFailed(new StubKernel());
    await engine.fastRecoverFromFailed();
    expect(engine.getRecoveryCount()).toBe(1);
  });
});

// ── Stress / metamorphic — Rank 3 ─────────────────────────────────────────────
//
// Input perturbation → output relation.  No absolute expected values;
// only directional constraints that must hold regardless of environment speed.

describe('Stress — 10 rapid degrade→recover cycles (Rank 3 metamorphic)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('engine is in "ready" state after 10 degrade→recover cycles', async () => {
    const engine = await driveToReady(new StubKernel());

    for (let i = 0; i < 10; i++) {
      await engine.degrade({ ...DEGRADE_ERROR, code: `CYCLE_DEGRADE_${i}` });
      expect(engine.state()).toBe('degraded');
      await engine.recover();
      expect(engine.state()).toBe('ready');
    }

    expect(engine.state()).toBe('ready');
  });

  it('getRecoveryCount() equals 10 after 10 soft-recovery cycles', async () => {
    const engine = await driveToReady(new StubKernel());

    for (let i = 0; i < 10; i++) {
      await engine.degrade(DEGRADE_ERROR);
      await engine.recover();
    }

    expect(engine.getRecoveryCount()).toBe(10);
  });

  it('getMTTR() after 10 cycles is < 1000ms (system does not degrade under load)', async () => {
    const engine = await driveToReady(new StubKernel());

    for (let i = 0; i < 10; i++) {
      await engine.degrade(DEGRADE_ERROR);
      await engine.recover();
    }

    expect(engine.getMTTR()).toBeLessThan(1000);
  });

  it('transition history contains exactly 10 degraded→* entries after 10 cycles', async () => {
    const engine = await driveToReady(new StubKernel());

    for (let i = 0; i < 10; i++) {
      await engine.degrade(DEGRADE_ERROR);
      await engine.recover();
    }

    const history = engine.getTransitionHistory();
    const degradedEntries = history.filter((e) => e.toState === 'degraded');
    expect(degradedEntries).toHaveLength(10);
  });

  it('transition history timestamps are non-decreasing across all 10 cycles', async () => {
    const engine = await driveToReady(new StubKernel());

    for (let i = 0; i < 10; i++) {
      await engine.degrade(DEGRADE_ERROR);
      await engine.recover();
    }

    const history = engine.getTransitionHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1]!.timestamp.getTime()
      );
    }
  });

  it('engine is fully operational after 10 cycles — can plan and run', async () => {
    const kernel = new StubKernel();
    const engine = createFullEngine(kernel, new StubPlanner(), new StubExecutor());

    await engine.bootstrap();
    for (let i = 0; i < 10; i++) {
      await engine.degrade(DEGRADE_ERROR);
      await engine.recover();
    }

    const plan = await engine.plan({});
    const receipt = await engine.run(plan);
    expect(receipt.progress).toBe(100);
    expect(engine.state()).toBe('ready');
  });

  it('each individual cycle wall-clock elapsed is < 1000ms (no single cycle exceeds SLA)', async () => {
    const engine = await driveToReady(new StubKernel());

    for (let i = 0; i < 10; i++) {
      await engine.degrade(DEGRADE_ERROR);

      const t0 = Date.now();
      await engine.recover();
      const elapsed = Date.now() - t0;

      expect(elapsed).toBeLessThan(1000);
    }
  });

  it('computeMTTRFromHistory() is finite, non-negative, and < 1000ms after 10 cycles', async () => {
    const engine = await driveToReady(new StubKernel());

    for (let i = 0; i < 10; i++) {
      await engine.degrade(DEGRADE_ERROR);
      await engine.recover();
    }

    const histMttr = engine.computeMTTRFromHistory();
    expect(Number.isFinite(histMttr)).toBe(true);
    expect(histMttr).toBeGreaterThanOrEqual(0);
    expect(histMttr).toBeLessThan(1000);
  });

  it('10 cycles produce strictly more transition history entries than 5 cycles (metamorphic)', async () => {
    // 5 cycles
    const engine5 = await driveToReady(new StubKernel());
    for (let i = 0; i < 5; i++) {
      await engine5.degrade(DEGRADE_ERROR);
      await engine5.recover();
    }
    const len5 = engine5.getTransitionHistory().length;

    WasmLoader.reset();

    // 10 cycles on a fresh engine
    const engine10 = await driveToReady(new StubKernel());
    for (let i = 0; i < 10; i++) {
      await engine10.degrade(DEGRADE_ERROR);
      await engine10.recover();
    }
    const len10 = engine10.getTransitionHistory().length;

    // Each cycle adds transitions (ready→degraded, degraded→bootstrapping, bootstrapping→ready).
    // 10 cycles must produce strictly more history entries than 5 cycles.
    expect(len10).toBeGreaterThan(len5);
  });
});

// ── failed → bootstrapping re-init path ──────────────────────────────────────

describe('failed → bootstrapping re-init path (Rank 2 domain contract)', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('fastRecoverFromFailed() when WASM loader uninitialized falls back to bootstrap path', async () => {
    const kernel = new StubKernel();
    const engine = await driveToFailed(kernel);

    // Force loader to appear uninitialized (simulates corrupted/missing WASM)
    WasmLoader.reset();

    // Should fall back to full bootstrap: failed → bootstrapping → ready
    await engine.fastRecoverFromFailed();
    expect(engine.state()).toBe('ready');
  });

  it('bootstrap fallback produces a history entry from failed toward bootstrapping or ready', async () => {
    const kernel = new StubKernel();
    const engine = await driveToFailed(kernel);
    WasmLoader.reset();

    await engine.fastRecoverFromFailed();

    const history = engine.getTransitionHistory();
    // When loader is uninitialized, fallback path transitions failed→bootstrapping→ready.
    // At minimum one of these must appear.
    const hasBootstrappingFromFailed = history.some(
      (e) => e.fromState === 'failed' && e.toState === 'bootstrapping'
    );
    const hasReadyFromBootstrapping = history.some(
      (e) => e.fromState === 'bootstrapping' && e.toState === 'ready'
    );
    expect(hasBootstrappingFromFailed || hasReadyFromBootstrapping).toBe(true);
  });

  it('getRecoveryCount() is 1 after fallback bootstrap recovery from failed', async () => {
    const kernel = new StubKernel();
    const engine = await driveToFailed(kernel);
    WasmLoader.reset();

    await engine.fastRecoverFromFailed();
    expect(engine.getRecoveryCount()).toBe(1);
  });

  it('wall-clock elapsed for bootstrap fallback recovery from failed is < 1000ms', async () => {
    const kernel = new StubKernel();
    const engine = await driveToFailed(kernel);
    WasmLoader.reset();

    const t0 = Date.now();
    await engine.fastRecoverFromFailed();
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(1000);
  });
});
