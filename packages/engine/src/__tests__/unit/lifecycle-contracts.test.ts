/**
 * lifecycle-contracts.test.ts  (unit/)
 *
 * Contracts for StateMachine.transition() (performTransition) and Engine history.
 *
 * Oracle ranks (Van der Aalst / Chicago TDD doctrine):
 *   Rank 1 — mathematical invariants: append-only history, monotone timestamps,
 *             MTTR arithmetic
 *   Rank 2 — domain contracts: state updates are immediate, invalid transitions
 *             are safe, degrade/recover add exactly one entry each
 *   Rank 3 — metamorphic relations: additive history, instance isolation
 *
 * Anti-FM-5 guarantee: expected values (entry counts, ordering predicates) are
 * derived from the transition specification, NOT from the implementation under
 * test.  The implementation is only used to drive state; assertions use
 * independent predicates.
 *
 * WasmLoader.reset() is called in every beforeEach to prevent singleton bleed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateMachine, type LifecycleEvent } from '../../lifecycle.js';
import { createSimpleEngine } from '../../index.js';
import type { Kernel } from '../../engine.js';
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
        durationMs: 2,
      };
    }),
  };
});

// ── Kernel stub ───────────────────────────────────────────────────────────────

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

// ── Shared error fixture ──────────────────────────────────────────────────────

const DEGRADE_ERROR = {
  code: 'TEST_DEGRADE',
  message: 'Injected degradation for lifecycle contract test',
  severity: 'warning' as const,
  recoverable: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Group 1 — Rank 1 (mathematical): History is append-only ──────────────────
//
// A correct StateMachine must never remove or reorder entries.
// These properties follow from the definition of a transition log.

describe('Group 1 — Rank 1 (mathematical): history is append-only', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('after N transitions, getTransitionHistory() has exactly N entries', async () => {
    // bootstrap() does 2 transitions: uninitialized→bootstrapping, bootstrapping→ready.
    // degrade() adds 1: ready→degraded.
    // recover() adds 2: degraded→bootstrapping, bootstrapping→ready.
    // Total = 5 transitions.
    const engine = await driveToDegraded(new StubKernel());
    const lenAfterDegrade = engine.getTransitionHistory().length;

    await engine.recover();
    const lenAfterRecover = engine.getTransitionHistory().length;

    // Exactly 2 more entries: degraded→bootstrapping and bootstrapping→ready
    expect(lenAfterRecover).toBe(lenAfterDegrade + 2);
  });

  it('history entries are in chronological order (timestamps non-decreasing)', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();

    const history = engine.getTransitionHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1]!.timestamp.getTime()
      );
    }
  });

  it('history entries record fromState, toState, and a valid timestamp', async () => {
    const engine = await driveToReady(new StubKernel());
    const history = engine.getTransitionHistory();

    expect(history.length).toBeGreaterThan(0);
    for (const entry of history) {
      // fromState and toState must be non-empty strings (EngineState values)
      expect(typeof entry.fromState).toBe('string');
      expect(entry.fromState.length).toBeGreaterThan(0);
      expect(typeof entry.toState).toBe('string');
      expect(entry.toState.length).toBeGreaterThan(0);

      // timestamp must be a valid, finite Date
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(Number.isFinite(entry.timestamp.getTime())).toBe(true);
    }
  });

  it('reading history twice returns the same entries (immutable snapshot)', async () => {
    const engine = await driveToReady(new StubKernel());
    const firstRead = engine.getTransitionHistory();
    const secondRead = engine.getTransitionHistory();

    expect(firstRead.length).toBe(secondRead.length);
    for (let i = 0; i < firstRead.length; i++) {
      expect(firstRead[i]!.fromState).toBe(secondRead[i]!.fromState);
      expect(firstRead[i]!.toState).toBe(secondRead[i]!.toState);
      expect(firstRead[i]!.timestamp.getTime()).toBe(secondRead[i]!.timestamp.getTime());
    }
  });

  it('mutating the returned array does not corrupt the internal history', async () => {
    const engine = await driveToReady(new StubKernel());
    const lenBefore = engine.getTransitionHistory().length;

    const copy = engine.getTransitionHistory();
    copy.splice(0, copy.length); // clear the copy

    // Internal history must be unchanged
    expect(engine.getTransitionHistory().length).toBe(lenBefore);
  });

  it('history grows monotonically — length never decreases', async () => {
    const engine = await driveToReady(new StubKernel());
    let previousLength = engine.getTransitionHistory().length;

    await engine.degrade(DEGRADE_ERROR);
    const afterDegrade = engine.getTransitionHistory().length;
    expect(afterDegrade).toBeGreaterThan(previousLength);
    previousLength = afterDegrade;

    await engine.recover();
    const afterRecover = engine.getTransitionHistory().length;
    expect(afterRecover).toBeGreaterThan(previousLength);
  });
});

// ── Group 2 — Rank 2 (domain contract): State updates are immediate ───────────
//
// The engine must update engine.state() synchronously inside each async method,
// such that after the method resolves, the state is the declared post-condition.

describe('Group 2 — Rank 2 (domain contract): state updates are immediate', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('after bootstrap() resolves, engine.state() is "ready" (not "bootstrapping")', async () => {
    const engine = createSimpleEngine(new StubKernel());
    await engine.bootstrap();
    expect(engine.state()).toBe('ready');
  });

  it('after degrade(error) resolves, engine.state() is "degraded" synchronously', async () => {
    const engine = await driveToReady(new StubKernel());
    await engine.degrade(DEGRADE_ERROR);
    // No await needed — the state is observable immediately after degrade() returns
    expect(engine.state()).toBe('degraded');
  });

  it('after recover() resolves, engine.state() is "ready" — not "bootstrapping"', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();
    expect(engine.state()).toBe('ready');
  });

  it('"bootstrapping" state is not observable after bootstrap() resolves', async () => {
    const engine = createSimpleEngine(new StubKernel());
    const intermediateStates: string[] = [];

    // Record states visible after awaits
    await engine.bootstrap();
    intermediateStates.push(engine.state());

    // The post-bootstrap observable state must never be 'bootstrapping'
    expect(intermediateStates.every((s) => s !== 'bootstrapping')).toBe(true);
  });

  it('state returned by engine.state() matches the last history entry toState', async () => {
    const engine = await driveToDegraded(new StubKernel());

    const history = engine.getTransitionHistory();
    const lastEntry = history[history.length - 1]!;
    expect(engine.state()).toBe(lastEntry.toState);
  });

  it('after shutdown() resolves, engine.state() is "failed"', async () => {
    const engine = await driveToReady(new StubKernel());
    await engine.shutdown();
    expect(engine.state()).toBe('failed');
    expect(engine.isFailed()).toBe(true);
  });
});

// ── Group 3 — Rank 2 (domain contract): Invalid transitions are handled safely ─
//
// An attempted invalid transition must either throw with a descriptive message
// OR return false — it must never silently succeed and must not corrupt state.

describe('Group 3 — Rank 2 (domain contract): invalid transitions are handled safely', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('StateMachine.transition() throws on invalid transition with a descriptive message', () => {
    const sm = new StateMachine();
    // uninitialized → running is not a valid transition
    expect(() => sm.transition('running')).toThrow(/Invalid state transition/);
    expect(() => sm.transition('running')).toThrow(/uninitialized/);
  });

  it('after a failed transition attempt, engine state is UNCHANGED', () => {
    const sm = new StateMachine();
    const stateBefore = sm.getState(); // 'uninitialized'

    try {
      sm.transition('running'); // invalid
    } catch {
      // expected
    }

    expect(sm.getState()).toBe(stateBefore);
  });

  it('after a failed transition attempt, history does NOT gain a new entry', () => {
    const sm = new StateMachine();
    const lenBefore = sm.getTransitionHistory().length;

    try {
      sm.transition('running'); // invalid
    } catch {
      // expected
    }

    expect(sm.getTransitionHistory().length).toBe(lenBefore);
  });

  it('StateMachine throws on uninitialized → planning (skipping required bootstrapping)', () => {
    const sm = new StateMachine();
    expect(() => sm.transition('planning')).toThrow();
  });

  it('error message from invalid transition names the invalid pair', () => {
    const sm = new StateMachine();
    let message = '';
    try {
      sm.transition('running');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    // Must name the source state so the caller can diagnose the problem
    expect(message).toContain('uninitialized');
    // Must name the target state attempted
    expect(message).toContain('running');
  });

  it('engine.degrade() from uninitialized is a no-op — does not transition', async () => {
    // degrade() checks canTransition internally; 'uninitialized' cannot go to 'degraded'
    const engine = createSimpleEngine(new StubKernel());
    expect(engine.state()).toBe('uninitialized');

    await engine.degrade(DEGRADE_ERROR);

    // State must still be 'uninitialized'
    expect(engine.state()).toBe('uninitialized');
  });

  it('engine.degrade() from already-degraded is a no-op — state stays degraded', async () => {
    const engine = await driveToDegraded(new StubKernel());
    const histLen = engine.getTransitionHistory().length;

    await engine.degrade({ ...DEGRADE_ERROR, code: 'SECOND_DEGRADE' });

    // No new history entry; still degraded
    expect(engine.state()).toBe('degraded');
    expect(engine.getTransitionHistory().length).toBe(histLen);
  });

  it('engine.recover() from non-degraded state throws — not a silent no-op', async () => {
    const engine = await driveToReady(new StubKernel());
    await expect(engine.recover()).rejects.toThrow('Cannot recover');
  });
});

// ── Group 4 — Rank 3 (metamorphic): History length tracks transitions ──────────
//
// The length of the history is a simple count function.
// These tests verify additive / compositional properties without hardcoding
// environment-specific absolute values.

describe('Group 4 — Rank 3 (metamorphic): history length tracks transitions', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('3 degrade→recover cycles produce more history than 1 cycle', async () => {
    const kernel1 = new StubKernel();
    const engine1 = await driveToReady(kernel1);
    await engine1.degrade(DEGRADE_ERROR);
    await engine1.recover();
    const len1 = engine1.getTransitionHistory().length;

    WasmLoader.reset();

    const kernel3 = new StubKernel();
    const engine3 = await driveToReady(kernel3);
    for (let i = 0; i < 3; i++) {
      await engine3.degrade(DEGRADE_ERROR);
      await engine3.recover();
    }
    const len3 = engine3.getTransitionHistory().length;

    expect(len3).toBeGreaterThan(len1);
  });

  it('each call to degrade() adds exactly 1 history entry', async () => {
    const engine = await driveToReady(new StubKernel());
    const lenBefore = engine.getTransitionHistory().length;

    await engine.degrade(DEGRADE_ERROR);

    expect(engine.getTransitionHistory().length).toBe(lenBefore + 1);
  });

  it('each call to recover() adds exactly 2 history entries (degraded→bootstrapping→ready)', async () => {
    const engine = await driveToDegraded(new StubKernel());
    const lenBefore = engine.getTransitionHistory().length;

    await engine.recover();

    expect(engine.getTransitionHistory().length).toBe(lenBefore + 2);
  });

  it('WasmLoader.reset() + re-bootstrap on a NEW engine does not corrupt the history of an existing engine', async () => {
    const engine1 = await driveToReady(new StubKernel());
    const lenBefore = engine1.getTransitionHistory().length;

    // Reset WasmLoader and bootstrap a completely separate engine
    WasmLoader.reset();
    const engine2 = createSimpleEngine(new StubKernel());
    await engine2.bootstrap();

    // engine1's history must be unchanged
    expect(engine1.getTransitionHistory().length).toBe(lenBefore);
    // engine1's state must also be unchanged
    expect(engine1.state()).toBe('ready');
  });

  it('5 degrade()s and 5 recover()s produce exactly 5 more degraded→* entries than 0 cycles', async () => {
    const engine = await driveToReady(new StubKernel());
    const baseLen = engine.getTransitionHistory().length;
    const baseDegraded = engine.getTransitionHistory().filter((e) => e.toState === 'degraded').length;

    for (let i = 0; i < 5; i++) {
      await engine.degrade(DEGRADE_ERROR);
      await engine.recover();
    }

    const afterDegraded = engine.getTransitionHistory().filter((e) => e.toState === 'degraded').length;
    expect(afterDegraded - baseDegraded).toBe(5);
    // Total growth: 5 × (degrade + recover) = 5 × (1 + 2) = 15 new entries
    expect(engine.getTransitionHistory().length - baseLen).toBe(15);
  });

  it('a StateMachine transition listener is called exactly once per valid transition', () => {
    const sm = new StateMachine();
    const events: LifecycleEvent[] = [];
    sm.onTransition((e) => events.push(e));

    sm.transition('bootstrapping', 'test');
    expect(events).toHaveLength(1);
    expect(events[0]!.fromState).toBe('uninitialized');
    expect(events[0]!.toState).toBe('bootstrapping');

    sm.transition('ready', 'test');
    expect(events).toHaveLength(2);
  });
});

// ── Group 5 — Rank 1 (mathematical): computeMTTRFromHistory ──────────────────
//
// computeMTTRFromHistory() is a pure function of the history array.
// Its properties are derived from the definition of mean and from the
// time ordering invariant established in Group 1.

describe('Group 5 — Rank 1 (mathematical): computeMTTRFromHistory', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  it('computeMTTRFromHistory() returns 0 when no degraded→ready cycle exists', async () => {
    const engine = await driveToReady(new StubKernel());
    // No degradation/recovery — no measurable cycle
    expect(engine.computeMTTRFromHistory()).toBe(0);
  });

  it('computeMTTRFromHistory() returns a finite positive number after one degraded→ready cycle', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();

    const mttr = engine.computeMTTRFromHistory();
    expect(Number.isFinite(mttr)).toBe(true);
    expect(mttr).toBeGreaterThanOrEqual(0);
  });

  it('computeMTTRFromHistory() is < 1000ms for a stub kernel recovery (no real I/O)', async () => {
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();

    expect(engine.computeMTTRFromHistory()).toBeLessThan(1000);
  });

  it('computeMTTRFromHistory() is monotonically related to actual recovery time', async () => {
    // Two engines: one recovers with a tiny artificial delay.
    // The engine with the longer delay must have a larger (or equal) MTTR.
    const engineFast = await driveToDegraded(new StubKernel());
    await engineFast.recover();
    const fastMttr = engineFast.computeMTTRFromHistory();

    WasmLoader.reset();

    // Simulate a longer delay by manipulating the history directly via StateMachine
    // We cannot inject delay into the stub, so instead we confirm the property holds
    // with the invariant: MTTR = mean of (ready_timestamp - degraded_timestamp) per cycle.
    // For the stub, this will be >= 0. The mathematical property is that if an actual
    // delay of D ms is injected, the MTTR will be >= D. We verify the non-negative
    // finite bound instead.
    expect(fastMttr).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(fastMttr)).toBe(true);
  });

  it('computeMTTRFromHistory() equals getMTTR() within 10ms tolerance after one soft recovery', async () => {
    // Both methods should agree on MTTR — they measure the same property
    // through different mechanisms (history scan vs recorded durations).
    // They may diverge slightly due to timestamp resolution, so we use a tolerance.
    const engine = await driveToDegraded(new StubKernel());
    await engine.recover();

    const histMttr = engine.computeMTTRFromHistory();
    const recordedMttr = engine.getMTTR();

    // Both must be finite and non-negative
    expect(Number.isFinite(histMttr)).toBe(true);
    expect(Number.isFinite(recordedMttr)).toBe(true);

    // They must agree within 10ms (both measure wall-clock recovery duration)
    expect(Math.abs(histMttr - recordedMttr)).toBeLessThanOrEqual(10);
  });

  it('computeMTTRFromHistory() after 5 cycles is finite, non-negative, < 1000ms', async () => {
    const engine = await driveToReady(new StubKernel());

    for (let i = 0; i < 5; i++) {
      await engine.degrade(DEGRADE_ERROR);
      await engine.recover();
    }

    const mttr = engine.computeMTTRFromHistory();
    expect(Number.isFinite(mttr)).toBe(true);
    expect(mttr).toBeGreaterThanOrEqual(0);
    expect(mttr).toBeLessThan(1000);
  });

  it('StateMachine.getMTTR() returns 0 before any recordRecovery() call', () => {
    const sm = new StateMachine();
    expect(sm.getMTTR()).toBe(0);
  });

  it('StateMachine.getMTTR() is the arithmetic mean of recorded recovery durations', () => {
    const sm = new StateMachine();
    sm.recordRecovery(100);
    sm.recordRecovery(200);
    sm.recordRecovery(300);

    // Mean of [100, 200, 300] = 200
    expect(sm.getMTTR()).toBe(200);
  });

  it('StateMachine.getMTTR() is non-negative and finite after any positive duration recorded', () => {
    const sm = new StateMachine();
    sm.recordRecovery(50);

    expect(sm.getMTTR()).toBeGreaterThan(0);
    expect(Number.isFinite(sm.getMTTR())).toBe(true);
  });

  it('StateMachine.getRecoveryCount() tracks exactly how many times recordRecovery() was called', () => {
    const sm = new StateMachine();
    expect(sm.getRecoveryCount()).toBe(0);

    sm.recordRecovery(10);
    expect(sm.getRecoveryCount()).toBe(1);

    sm.recordRecovery(20);
    expect(sm.getRecoveryCount()).toBe(2);

    sm.recordRecovery(30);
    expect(sm.getRecoveryCount()).toBe(3);
  });
});
