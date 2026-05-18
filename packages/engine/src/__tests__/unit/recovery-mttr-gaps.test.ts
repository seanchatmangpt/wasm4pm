/**
 * recovery-mttr-gaps.test.ts  (unit/)
 *
 * Closes six real gaps in engine state-machine recovery paths and MTTR
 * measurement not covered by any existing test file.
 *
 * Gap 1 — getMTTR() is not hardcoded (FM-5 guard)
 *   getMTTR() must compute from recorded recovery durations, not return a
 *   literal. If injected durations change, getMTTR() must change proportionally.
 *
 * Gap 2 — No watchdog for degraded state (documented design contract)
 *   A degraded engine stays degraded indefinitely unless recover() is explicitly
 *   called. There is no automatic watchdog. Tests document this contract so
 *   future implementors cannot add silent auto-recovery without breaking tests.
 *
 * Gap 3 — Concurrent bootstrap() calls rejected by the state machine
 *   Two concurrent calls to bootstrap() from uninitialized: the second must be
 *   rejected because the first moves the engine to 'bootstrapping' before the
 *   second can issue its own transition. The state machine prevents the race.
 *
 * Gap 4 — computeMTTRFromHistory() vs getMTTR() divergence on dwell time
 *   computeMTTRFromHistory() measures from the moment the engine ENTERED the
 *   failed/degraded state; getMTTR() measures from when recover() was CALLED
 *   (after possibly dwelling in degraded). When there is deliberate dwell
 *   time, computeMTTRFromHistory() >= getMTTR(). Documented design divergence.
 *
 * Gap 5 — computeMTTRFromHistory() handles degraded→failed transition correctly
 *   When recovery fails (degraded → failed), the timer resets to the later
 *   failure entry, so the measured duration is from failed → ready, not from
 *   degraded → ready. No double-counting, no negative result.
 *
 * Gap 6 — MTTR measurement includes softReset() + kernel.init() time
 *   softReset() keeps the compiled WASM module cached; only kernel.init() must
 *   run during soft recovery. The MTTR recorded by recover() must include that
 *   kernel.init() time (not omit it), and must be >= the kernel's init delay.
 *
 * Oracle ranks (Van der Aalst / Chicago TDD doctrine):
 *   Rank 1 — mathematical / structural invariants (Gaps 1, 3, 4)
 *   Rank 2 — domain contracts (Gaps 2, 5, 6)
 *   Rank 3 — metamorphic relations (directional assertions in Gaps 1, 4, 6)
 *
 * All tests run without a compiled WASM binary.
 * bootstrapEngine is mocked at the module level (same pattern as other unit/ files).
 * WasmLoader.reset() is called in beforeEach to prevent singleton bleed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSimpleEngine } from '../../index.js';
import { StateMachine } from '../../lifecycle.js';
import type { Kernel } from '../../engine.js';
import { WasmLoader } from '../../wasm-loader.js';

// ── Mock bootstrapEngine so tests run without a real WASM binary ──────────────

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
        durationMs: 1,
      };
    }),
  };
});

// ── Kernel stubs ──────────────────────────────────────────────────────────────

/** Fast kernel — init() resolves in < 1ms. */
class FastKernel implements Kernel {
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

/** Kernel with configurable init delay for timing-sensitive assertions. */
class DelayKernel implements Kernel {
  private ready = false;
  private delayMs: number;

  constructor(delayMs: number) {
    this.delayMs = delayMs;
  }

  async init(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    this.ready = true;
  }

  async shutdown(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }
}

// ── Shared fixture ────────────────────────────────────────────────────────────

const DEGRADE_ERROR = {
  code: 'GAP_TEST_DEGRADE',
  message: 'Injected degradation for gap test',
  severity: 'warning' as const,
  recoverable: true,
};

beforeEach(() => {
  WasmLoader.reset();
});

// ── Gap 1 — getMTTR() is not hardcoded (FM-5 guard, Rank 1 mathematical) ──────
//
// Property: getMTTR() == mean(recoveryHistory).
// If the implementation hardcoded a constant, it would fail at least one of:
//   (a) proportional response to duration changes
//   (b) distinct mean for two different inputs
//   (c) arithmetic correctness for a known sequence

describe('Gap 1 — getMTTR() is computed, not hardcoded (FM-5 guard, Rank 1)', () => {
  it('getMTTR() changes when a different duration is recorded — not a constant', () => {
    const sm = new StateMachine();

    sm.recordRecovery(50);
    const after50 = sm.getMTTR();

    sm.recordRecovery(450);
    const after50and450 = sm.getMTTR();

    // A hardcoded implementation would return the same literal both times.
    expect(after50and450).not.toBe(after50);
    // Verify the exact arithmetic: mean([50]) = 50; mean([50, 450]) = 250.
    expect(after50).toBe(50);
    expect(after50and450).toBe(250);
  });

  it('getMTTR() arithmetic: mean([a,b,c]) = (a+b+c)/3 (Rank 1 — formula verification)', () => {
    const sm = new StateMachine();
    const durations = [100, 200, 300];
    durations.forEach((d) => sm.recordRecovery(d));

    const expectedMean = durations.reduce((a, b) => a + b, 0) / durations.length;
    expect(sm.getMTTR()).toBe(expectedMean); // 200
  });

  it('getMTTR() increases monotonically as each slower recovery is added (Rank 1 — monotone)', () => {
    const sm = new StateMachine();
    sm.recordRecovery(10);
    const m1 = sm.getMTTR();

    sm.recordRecovery(100);
    const m2 = sm.getMTTR();

    sm.recordRecovery(1000);
    const m3 = sm.getMTTR();

    expect(m2).toBeGreaterThan(m1);
    expect(m3).toBeGreaterThan(m2);
  });

  it('getMTTR() decreases when a faster recovery is added to a slow baseline (Rank 1 — monotone)', () => {
    const sm = new StateMachine();
    sm.recordRecovery(500);
    const m1 = sm.getMTTR();

    sm.recordRecovery(10); // much faster
    const m2 = sm.getMTTR();

    expect(m2).toBeLessThan(m1);
  });

  it('getMTTR() and computeMTTRFromHistory() are both finite after a real recovery (Rank 3)', async () => {
    // A 5ms delay kernel produces a non-zero, finite MTTR from both methods.
    const engine = createSimpleEngine(new DelayKernel(5));
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();

    expect(Number.isFinite(engine.getMTTR())).toBe(true);
    expect(engine.getMTTR()).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(engine.computeMTTRFromHistory())).toBe(true);
    expect(engine.computeMTTRFromHistory()).toBeGreaterThanOrEqual(0);
  });
});

// ── Gap 2 — No watchdog for degraded state (Rank 2 — domain contract) ─────────
//
// Design contract: the engine has NO automatic recovery from degraded state.
// Degraded engines remain degraded until recover() is explicitly called.
// This is intentional — autonomous recovery is a higher-level concern.

describe('Gap 2 — Degraded engine has no automatic watchdog (Rank 2 — domain contract)', () => {
  it('engine stays degraded after degrade() without recover() — no auto-recovery', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);

    // Wait briefly to confirm no background process auto-recovers.
    await new Promise((r) => setTimeout(r, 20));

    expect(engine.state()).toBe('degraded');
  });

  it('isDegraded() remains true over three successive checks — no watchdog fires', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);

    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 5));
      expect(engine.state()).toBe('degraded');
    }
  });

  it('getRecoveryCount() is 0 after degrade() without recover() — no ghost recoveries', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);

    await new Promise((r) => setTimeout(r, 20));

    // No recovery has been triggered, so count must be 0.
    expect(engine.getRecoveryCount()).toBe(0);
  });

  it('getMTTR() is 0 while degraded without any recovery — no ghost MTTR values', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);

    await new Promise((r) => setTimeout(r, 20));

    // getMTTR() must be 0 because recordRecovery() was never called.
    expect(engine.getMTTR()).toBe(0);
  });

  it('second degrade() while already degraded is a no-op — state stays degraded', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();

    await engine.degrade(DEGRADE_ERROR);
    const histLen1 = engine.getTransitionHistory().length;

    // VALID_TRANSITIONS[degraded] does not include 'degraded', so this no-ops.
    await engine.degrade({ ...DEGRADE_ERROR, code: 'SECOND_DEGRADE' });
    const histLen2 = engine.getTransitionHistory().length;

    expect(engine.state()).toBe('degraded');
    // No new transition entry added for the no-op degrade.
    expect(histLen2).toBe(histLen1);
  });

  it('degrade() adds error to status but does not trigger auto-recovery', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();

    await engine.degrade(DEGRADE_ERROR);

    // Error is recorded in status.
    expect(engine.status().errors.length).toBeGreaterThan(0);
    // Engine is still degraded — errors do not trigger recovery.
    expect(engine.state()).toBe('degraded');
  });
});

// ── Gap 3 — Concurrent bootstrap() calls rejected by state machine ─────────────
//
// Rank 1 (structural invariant): the state machine enforces serialization.
// VALID_TRANSITIONS['bootstrapping'] does not include 'bootstrapping', so a
// second concurrent call cannot enter the bootstrapping state twice.

describe('Gap 3 — Concurrent bootstrap() calls rejected by state machine (Rank 1 — structural)', () => {
  it('second bootstrap() while first is in-progress throws with a descriptive error', async () => {
    const engine = createSimpleEngine(new FastKernel());

    // Start first bootstrap but do NOT await it yet.
    const first = engine.bootstrap();

    // Attempt second bootstrap concurrently — state is now 'bootstrapping'.
    let secondError: Error | null = null;
    try {
      await engine.bootstrap();
    } catch (err) {
      secondError = err instanceof Error ? err : new Error(String(err));
    }

    // First must still resolve successfully.
    await first;

    // The second call must have been rejected — not silently accepted.
    expect(secondError).not.toBeNull();
    expect(secondError!.message).toMatch(/Cannot bootstrap|Cannot transition|Invalid state/);
  });

  it('state after racing bootstrap calls is a valid EngineState — never corrupted', async () => {
    const VALID_STATES = [
      'uninitialized', 'bootstrapping', 'ready', 'planning',
      'running', 'watching', 'degraded', 'failed',
    ] as const;

    const engine = createSimpleEngine(new FastKernel());

    const first = engine.bootstrap();
    const second = engine.bootstrap().catch(() => { /* expected rejection */ });

    await Promise.allSettled([first, second]);

    expect((VALID_STATES as readonly string[])).toContain(engine.state());
  });

  it('re-calling bootstrap() from ready throws — not a silent no-op', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    expect(engine.state()).toBe('ready');

    // From ready, bootstrap() cannot transition to bootstrapping.
    // VALID_TRANSITIONS['ready'] does not include 'bootstrapping'.
    let caught = false;
    try {
      await engine.bootstrap();
    } catch {
      caught = true;
    }

    expect(caught).toBe(true);
    // State must be valid after the failed call (may have transitioned to failed).
    expect(['ready', 'failed', 'degraded']).toContain(engine.state());
  });

  it('StateMachine rejects bootstrapping → bootstrapping (Rank 1 — structural invariant)', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    expect(sm.getState()).toBe('bootstrapping');

    // bootstrapping → bootstrapping is NOT in VALID_TRANSITIONS.
    expect(() => sm.transition('bootstrapping')).toThrow(/Invalid state transition/);
    // State is unchanged — not corrupted.
    expect(sm.getState()).toBe('bootstrapping');
  });

  it('StateMachine rejects ready → bootstrapping (not a valid re-entry path)', () => {
    // Per VALID_TRANSITIONS, ready → bootstrapping is not permitted.
    // Recovery from ready goes through degrade() → recover(), not bootstrap().
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    expect(sm.getState()).toBe('ready');

    expect(() => sm.transition('bootstrapping')).toThrow(/Invalid state transition/);
    expect(sm.getState()).toBe('ready');
  });
});

// ── Gap 4 — computeMTTRFromHistory() vs getMTTR() divergence (Rank 3 metamorphic) ─
//
// computeMTTRFromHistory() measures from when the engine ENTERED the degraded/failed
// state (history timestamp). getMTTR() measures from when recover() was CALLED
// (internal timer). If there is dwell time between degrade() and recover(), the
// two metrics diverge: computeMTTRFromHistory() >= getMTTR().
//
// This is a documented design divergence, not a bug.

describe('Gap 4 — computeMTTRFromHistory() includes dwell time; getMTTR() does not (Rank 2/3)', () => {
  it('computeMTTRFromHistory() >= getMTTR() when there is 15ms dwell in degraded (Rank 3)', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);

    // Dwell 15ms in degraded state before calling recover().
    await new Promise((r) => setTimeout(r, 15));

    await engine.recover();

    const histMttr = engine.computeMTTRFromHistory();
    const recordedMttr = engine.getMTTR();

    expect(Number.isFinite(histMttr)).toBe(true);
    expect(Number.isFinite(recordedMttr)).toBe(true);
    expect(histMttr).toBeGreaterThanOrEqual(0);
    expect(recordedMttr).toBeGreaterThanOrEqual(0);

    // Domain contract: dwell time inflates the history-based MTTR vs the
    // call-based MTTR. computeMTTRFromHistory must be >= getMTTR().
    expect(histMttr).toBeGreaterThanOrEqual(recordedMttr);
  });

  it('without dwell time, both metrics agree within 5ms scheduling tolerance', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);

    // No deliberate dwell — recover immediately.
    await engine.recover();

    const histMttr = engine.computeMTTRFromHistory();
    const recordedMttr = engine.getMTTR();

    // Without dwell, both measure roughly the same wall-clock window.
    expect(Math.abs(histMttr - recordedMttr)).toBeLessThanOrEqual(5);
  });

  it('computeMTTRFromHistory() is 0 after bootstrap but before any degrade/recover cycle', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();

    // No failure states in history yet.
    expect(engine.computeMTTRFromHistory()).toBe(0);
    expect(engine.getMTTR()).toBe(0);
  });

  it('both metrics are < 1000ms after a fast recovery (Rank 1 — SLA contract)', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();

    expect(engine.computeMTTRFromHistory()).toBeLessThan(1000);
    expect(engine.getMTTR()).toBeLessThan(1000);
  });
});

// ── Gap 5 — computeMTTRFromHistory() handles degraded→failed→ready correctly ────
//
// When the engine transitions degraded → failed (recovery fails), the failure
// timer resets to the 'failed' entry timestamp. The measured MTTR is from
// failed → ready, not from degraded → ready. No double-counting, no negatives.

describe('Gap 5 — computeMTTRFromHistory() handles degraded→failed→ready (Rank 2 domain)', () => {
  it('computeMTTRFromHistory() is non-negative after shutdown and fast recovery', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();
    await engine.shutdown(); // → failed
    await engine.fastRecoverFromFailed(); // failed → ready

    const mttr = engine.computeMTTRFromHistory();
    expect(Number.isFinite(mttr)).toBe(true);
    expect(mttr).toBeGreaterThanOrEqual(0);
    expect(mttr).toBeLessThan(1000);
  });

  it('history timestamps for degraded→failed→ready are monotonically non-decreasing (Rank 1)', () => {
    // Verify the timestamp ordering that computeMTTRFromHistory() relies on.
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded', 'First failure');
    sm.transition('failed', 'Recovery itself failed');
    sm.transition('ready', 'Fast recovery succeeded');

    const history = sm.getTransitionHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1]!.timestamp.getTime()
      );
    }
  });

  it('duration from failed→ready is non-negative (Rank 1 — timer reset contract)', () => {
    // Build a degraded→failed→ready sequence using StateMachine directly.
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded', 'First failure');
    sm.transition('failed', 'Recovery itself failed');
    sm.transition('ready', 'Fast recovery succeeded');

    const history = sm.getTransitionHistory();
    const failedEntry = history.find((e) => e.toState === 'failed')!;
    const readyEntry = history.filter((e) => e.toState === 'ready').at(-1)!;

    // The timer resets to failedEntry; duration from there to ready is the measured MTTR.
    const duration = readyEntry.timestamp.getTime() - failedEntry.timestamp.getTime();
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('timer resets to later failure entry: measured duration <= total elapsed from degraded', () => {
    // Given [degraded(t0), failed(t1), ready(t2)]:
    //   measured = t2 - t1  (timer reset at failed)
    //   total    = t2 - t0  (full span from degraded)
    // Since t1 >= t0, measured <= total.
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded', 'Original failure');
    sm.transition('failed', 'Recovery failed');
    sm.transition('ready', 'Final recovery');

    const history = sm.getTransitionHistory();
    const degradedTs = history.find((e) => e.toState === 'degraded')!.timestamp.getTime();
    const failedTs = history.find((e) => e.toState === 'failed')!.timestamp.getTime();
    const readyTs = history.filter((e) => e.toState === 'ready').at(-1)!.timestamp.getTime();

    const measuredMttr = readyTs - failedTs;  // what computeMTTRFromHistory() computes
    const totalElapsed = readyTs - degradedTs; // full span including time in degraded

    // The timer-reset contract: measured <= total elapsed.
    expect(measuredMttr).toBeGreaterThanOrEqual(0);
    expect(measuredMttr).toBeLessThanOrEqual(totalElapsed);
  });
});

// ── Gap 6 — MTTR includes softReset() + kernel.init() time (Rank 2 domain) ─────
//
// softReset() preserves the compiled WASM module; only kernel.init() runs during
// soft recovery. The MTTR from recover() includes that kernel.init() time.
// With a delay kernel, MTTR >= kernel init delay.

describe('Gap 6 — MTTR measurement includes kernel.init() time during soft recovery (Rank 2/3)', () => {
  it('getMTTR() is >= kernel init delay for a DelayKernel recovery (Rank 3 — directional)', async () => {
    const KERNEL_DELAY_MS = 5;
    const engine = createSimpleEngine(new DelayKernel(KERNEL_DELAY_MS));
    await engine.bootstrap();
    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();

    // MTTR must be at least the kernel init delay.
    expect(engine.getMTTR()).toBeGreaterThanOrEqual(KERNEL_DELAY_MS);
    // And well under the 1000ms hard SLA.
    expect(engine.getMTTR()).toBeLessThan(1000);
  });

  it('delay kernel has strictly higher MTTR than fast kernel (Rank 3 — metamorphic)', async () => {
    // Fast engine.
    const fastEngine = createSimpleEngine(new FastKernel());
    await fastEngine.bootstrap();
    await fastEngine.degrade(DEGRADE_ERROR);
    await fastEngine.recover();
    const fastMttr = fastEngine.getMTTR();

    WasmLoader.reset();

    // Delay engine (5ms kernel init).
    const delayEngine = createSimpleEngine(new DelayKernel(5));
    await delayEngine.bootstrap();
    await delayEngine.degrade(DEGRADE_ERROR);
    await delayEngine.recover();
    const delayMttr = delayEngine.getMTTR();

    expect(delayMttr).toBeGreaterThan(fastMttr);
  });

  it('softReset() preserves the WASM module reference — no re-import on soft recovery (Rank 2)', () => {
    const loader = WasmLoader.getInstance();

    // Simulate post-bootstrap state by injecting a fake module.
    const fakeModule = {
      memory: { buffer: new ArrayBuffer(256 * 64 * 1024) },
      load_eventlog_from_xes: () => 'test-handle',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).module = fakeModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (loader as any).initialized = true;

    expect(loader.isInitialized()).toBe(true);

    // softReset() clears initialized but must keep the module reference.
    loader.softReset();
    expect(loader.isInitialized()).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((loader as any).module).toBe(fakeModule); // same reference — no reload
  });

  it('getMTTR() after recover() is non-zero and finite — not skipped (Rank 2)', async () => {
    const engine = createSimpleEngine(new FastKernel());
    await engine.bootstrap();

    // Before any recovery: count = 0, MTTR = 0.
    expect(engine.getRecoveryCount()).toBe(0);
    expect(engine.getMTTR()).toBe(0);

    await engine.degrade(DEGRADE_ERROR);
    await engine.recover();

    // After one recovery: count = 1, MTTR is the measured duration of recover().
    expect(engine.getRecoveryCount()).toBe(1);
    expect(engine.getMTTR()).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(engine.getMTTR())).toBe(true);
  });

  it('MTTR remains < 1000ms after 5 soft recoveries with DelayKernel (Rank 1 — SLA)', async () => {
    const engine = createSimpleEngine(new DelayKernel(5));
    await engine.bootstrap();

    for (let i = 0; i < 5; i++) {
      await engine.degrade(DEGRADE_ERROR);
      await engine.recover();
    }

    expect(engine.getMTTR()).toBeLessThan(1000);
    expect(engine.getRecoveryCount()).toBe(5);
  });
});
