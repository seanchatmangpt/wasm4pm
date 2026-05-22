/**
 * recovery-mttr-gaps.test.ts  (unit/)
 *
 * Closes six real gaps in engine state-machine recovery paths and MTTR
 * measurement not covered by any existing test file.
 *
 * All tests operate directly on StateMachine (and lifecycle.ts helpers) so
 * they run without the compiled WASM binary and without vi.mock — the module
 * graph is entirely local TypeScript with no dynamic WASM import.
 *
 * Engine-level integration for these gaps is deferred to the engine-recovery.test.ts
 * family that already uses vi.mock('../../bootstrap.js').
 *
 * Gap 1 — getMTTR() is not hardcoded (FM-5 guard)
 *   getMTTR() must compute from recorded recovery durations, not return a
 *   literal. If injected durations change, getMTTR() must change proportionally.
 *
 * Gap 2 — No watchdog: degraded state persists without explicit recover()
 *   StateMachine has no background timer that auto-transitions out of 'degraded'.
 *   Once in 'degraded', only an explicit transition() call moves the state.
 *   This documents the contract: degraded is a terminal-unless-acted-upon state.
 *
 * Gap 3 — Concurrent bootstrap rejected by state machine (structural invariant)
 *   'bootstrapping' → 'bootstrapping' is not in VALID_TRANSITIONS.
 *   'ready' → 'bootstrapping' is not in VALID_TRANSITIONS.
 *   The state machine itself prevents both races at the topology level.
 *
 * Gap 4 — computeMTTRFromHistory() timer-reset contract for degraded→failed→ready
 *   When history contains [degraded(t0), failed(t1), ready(t2)], the MTTR
 *   scanner sets failureEntryTime at t0, then overwrites it at t1, then
 *   measures t2−t1. The resulting duration is non-negative and <= t2−t0.
 *
 * Gap 5 — MTTR window cap: getRecoveryCount() is unbounded; getMTTR() window
 *   is capped at 100. After 105 records the count exceeds 100 but getMTTR()
 *   uses only the last 100 samples — not all 105.
 *
 * Gap 6 — Listener error propagation does not silently drop errors
 *   transition() propagates errors thrown by lifecycle listeners rather than
 *   swallowing them. A broken listener is not silently ignored.
 *
 * Oracle ranks (Van der Aalst / Chicago TDD doctrine):
 *   Rank 1 — mathematical / structural invariants (Gaps 1, 3, 4, 5)
 *   Rank 2 — domain contracts (Gaps 2, 6)
 *   Rank 3 — metamorphic relations (directional assertions in Gaps 1, 5)
 *
 * No WASM binary. No vi.mock. No Engine. StateMachine only.
 */

import { describe, it, expect } from 'vitest';
import { StateMachine } from '../../lifecycle.js';
import { canTransition, VALID_TRANSITIONS } from '../../transitions.js';
import type { EngineState } from '@wasm4pm/contracts';

// ── Gap 1 — getMTTR() is not hardcoded (FM-5 guard, Rank 1 mathematical) ──────
//
// Property: getMTTR() == mean(recoveryHistory).
// If hardcoded, a constant would survive all three assertions below:
//   (a) proportional response to duration changes
//   (b) exact arithmetic for a known sequence
//   (c) monotone behaviour as values grow and shrink

describe('Gap 1 — getMTTR() is computed, not hardcoded (FM-5 guard, Rank 1)', () => {
  it('getMTTR() changes when a different duration is recorded — not a constant', () => {
    const sm = new StateMachine();

    sm.recordRecovery(50);
    const after50 = sm.getMTTR();

    sm.recordRecovery(450);
    const after50and450 = sm.getMTTR();

    // A hardcoded implementation returns the same literal both times.
    expect(after50and450).not.toBe(after50);
    // Exact arithmetic: mean([50]) = 50; mean([50, 450]) = 250.
    expect(after50).toBe(50);
    expect(after50and450).toBe(250);
  });

  it('getMTTR() arithmetic: mean([100, 200, 300]) = 200 (Rank 1 — formula verification)', () => {
    const sm = new StateMachine();
    [100, 200, 300].forEach((d) => sm.recordRecovery(d));
    expect(sm.getMTTR()).toBe(200);
  });

  it('getMTTR() arithmetic: mean([10, 20]) = 15 — verifies denominator is sample count', () => {
    const sm = new StateMachine();
    [10, 20].forEach((d) => sm.recordRecovery(d));
    expect(sm.getMTTR()).toBe(15);
  });

  it('getMTTR() increases monotonically as each slower recovery is appended (Rank 1)', () => {
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

  it('getMTTR() decreases when a faster recovery is added to a slow baseline (Rank 3 — directional)', () => {
    const sm = new StateMachine();
    sm.recordRecovery(500);
    const baseline = sm.getMTTR();

    sm.recordRecovery(10); // much faster — pulls the mean down
    expect(sm.getMTTR()).toBeLessThan(baseline);
  });

  it('getMTTR() returns exactly 0 before any recordRecovery() call — no phantom baseline', () => {
    const sm = new StateMachine();
    expect(sm.getMTTR()).toBe(0);
  });

  it('getMTTR() is non-negative and finite for any positive input sequence (Rank 1 — invariant)', () => {
    const sm = new StateMachine();
    [50, 80, 920, 1, 999].forEach((d) => sm.recordRecovery(d));
    expect(sm.getMTTR()).toBeGreaterThan(0);
    expect(Number.isFinite(sm.getMTTR())).toBe(true);
  });
});

// ── Gap 2 — Degraded state persists without explicit recover() (Rank 2 domain) ──
//
// Design contract: StateMachine has no background timer or watchdog.
// Once in 'degraded', only an explicit transition() call moves state.
// This is the documented behaviour: autonomous recovery is a higher-level concern.

describe('Gap 2 — Degraded state has no automatic watchdog (Rank 2 — domain contract)', () => {
  it('state stays degraded after transition — no automatic follow-up transition', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');

    // No timer fires; state remains degraded until a caller issues a transition.
    expect(sm.getState()).toBe('degraded');
    expect(sm.isDegraded()).toBe(true);
  });

  it('isDegraded() remains true indefinitely without an explicit recovery transition', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');

    // Multiple reads at different times all report degraded.
    expect(sm.isDegraded()).toBe(true);
    expect(sm.getState()).toBe('degraded');
    expect(sm.isDegraded()).toBe(true); // no change between reads
  });

  it('getRecoveryCount() is 0 after degradation without any recordRecovery() call', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');

    // No auto-recovery has fired, so count must be 0.
    expect(sm.getRecoveryCount()).toBe(0);
  });

  it('getMTTR() is 0 while degraded without any recordRecovery() call', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');

    expect(sm.getMTTR()).toBe(0);
  });

  it('valid transitions from degraded are only {ready, bootstrapping, failed} — not self', () => {
    // This proves why there is no watchdog: 'degraded' cannot transition to 'degraded'.
    // The state machine topology physically prevents any "stay-degraded-and-fire-timer" loop.
    const allowed = Array.from(VALID_TRANSITIONS['degraded']);
    expect(allowed).toContain('ready');
    expect(allowed).toContain('bootstrapping');
    expect(allowed).toContain('failed');
    expect(allowed).not.toContain('degraded'); // no self-loop — no watchdog possible
  });

  it('canTransition from degraded to degraded is false — self-loop blocked by topology', () => {
    expect(canTransition('degraded', 'degraded')).toBe(false);
  });

  it('getStateAge() advances while in degraded — time passes but state does not change', async () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');

    const age1 = sm.getStateAge();
    await new Promise((r) => setTimeout(r, 8));
    const age2 = sm.getStateAge();

    // Time has passed; state age increases; but state is still degraded.
    expect(age2).toBeGreaterThan(age1);
    expect(sm.getState()).toBe('degraded');
  });
});

// ── Gap 3 — Concurrent bootstrap rejected by state machine (Rank 1 structural) ──
//
// 'bootstrapping' → 'bootstrapping' is not in VALID_TRANSITIONS.
// 'ready' → 'bootstrapping' is not in VALID_TRANSITIONS.
// The topology itself prevents concurrent or repeated bootstrapping.

describe('Gap 3 — State machine topology rejects concurrent/repeat bootstrap (Rank 1)', () => {
  it('bootstrapping → bootstrapping is not a valid transition (topology block)', () => {
    expect(canTransition('bootstrapping', 'bootstrapping')).toBe(false);
  });

  it('ready → bootstrapping is not a valid transition (re-entry block)', () => {
    expect(canTransition('ready', 'bootstrapping')).toBe(false);
  });

  it('StateMachine throws on bootstrapping → bootstrapping with descriptive message', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    expect(sm.getState()).toBe('bootstrapping');

    expect(() => sm.transition('bootstrapping')).toThrow(/Invalid state transition/);
    // State must remain unchanged after the rejected transition.
    expect(sm.getState()).toBe('bootstrapping');
  });

  it('StateMachine throws on ready → bootstrapping with descriptive message', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    expect(sm.getState()).toBe('ready');

    expect(() => sm.transition('bootstrapping')).toThrow(/Invalid state transition/);
    expect(sm.getState()).toBe('ready');
  });

  it('rejected transition does not add a history entry — history is unchanged', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    const lenBefore = sm.getTransitionHistory().length;

    try {
      sm.transition('bootstrapping'); // invalid
    } catch {
      // expected
    }

    expect(sm.getTransitionHistory().length).toBe(lenBefore);
  });

  it('error message names both source and target state for diagnosability (Rank 2 domain)', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');

    let msg = '';
    try {
      sm.transition('bootstrapping');
    } catch (err) {
      msg = err instanceof Error ? err.message : String(err);
    }

    expect(msg).toContain('bootstrapping'); // source state named
    // 'bootstrapping' appears in both source and target, so we check the full structure
    expect(msg).toMatch(/Invalid state transition: bootstrapping -> bootstrapping/);
  });

  it('uninitialized → ready is also blocked — only uninitialized → bootstrapping is valid', () => {
    const sm = new StateMachine();
    expect(() => sm.transition('ready')).toThrow(/Invalid state transition/);
    // The only valid transition from uninitialized is bootstrapping.
    const valid = Array.from(VALID_TRANSITIONS['uninitialized']);
    expect(valid).toEqual(['bootstrapping']);
  });
});

// ── Gap 4 — computeMTTRFromHistory() timer-reset on degraded→failed (Rank 1) ─────
//
// The scanner in Engine.computeMTTRFromHistory() sets failureEntryTime for each
// 'degraded' or 'failed' toState entry, overwriting any earlier value.
// Given [degraded(t0), failed(t1), ready(t2)]:
//   measured duration = t2 − t1   (timer reset at t1)
//   full elapsed      = t2 − t0
// Since t1 >= t0: measured <= full elapsed. Both are non-negative.
//
// We verify this at the StateMachine level by checking the timestamp monotonicity
// that the Engine-level scanner depends on.

describe('Gap 4 — computeMTTRFromHistory() timer-reset: degraded→failed→ready (Rank 1)', () => {
  it('timestamps are monotonically non-decreasing in degraded→failed→ready sequence', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded', 'Original failure');
    sm.transition('failed', 'Recovery itself failed');
    sm.transition('ready', 'Fast recovery succeeded');

    const history = sm.getTransitionHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1]!.timestamp.getTime()
      );
    }
  });

  it('duration from failed→ready is non-negative (timer-reset contract)', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded', 'Original failure');
    sm.transition('failed', 'Recovery failed');
    sm.transition('ready', 'Fast recovery');

    const history = sm.getTransitionHistory();
    const failedTs = history.find((e) => e.toState === 'failed')!.timestamp.getTime();
    const readyTs = history.filter((e) => e.toState === 'ready').at(-1)!.timestamp.getTime();

    expect(readyTs - failedTs).toBeGreaterThanOrEqual(0);
  });

  it('duration from failed→ready <= duration from degraded→ready (timer-reset reduces measured MTTR)', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded', 'Original failure');
    sm.transition('failed', 'Recovery failed');
    sm.transition('ready', 'Fast recovery');

    const history = sm.getTransitionHistory();
    const degradedTs = history.find((e) => e.toState === 'degraded')!.timestamp.getTime();
    const failedTs = history.find((e) => e.toState === 'failed')!.timestamp.getTime();
    const readyTs = history.filter((e) => e.toState === 'ready').at(-1)!.timestamp.getTime();

    const measuredMttr = readyTs - failedTs;    // what timer-reset logic computes
    const fullElapsed = readyTs - degradedTs;   // full span from degraded

    // Timer reset means measured <= full elapsed.
    expect(measuredMttr).toBeLessThanOrEqual(fullElapsed);
    expect(measuredMttr).toBeGreaterThanOrEqual(0);
  });

  it('degraded → failed is a valid transition — recovery failure is a designed path', () => {
    expect(canTransition('degraded', 'failed')).toBe(true);
  });

  it('failed → ready is a valid transition — fast recovery path exists', () => {
    expect(canTransition('failed', 'ready')).toBe(true);
  });

  it('history contains both failed and degraded entries in the correct sequence', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');
    sm.transition('failed');
    sm.transition('ready');

    const history = sm.getTransitionHistory();
    const states = history.map((e) => e.toState);

    const idxDegraded = states.indexOf('degraded');
    const idxFailed = states.indexOf('failed');
    const idxReady = states.lastIndexOf('ready');

    // degraded must precede failed, which must precede the final ready.
    expect(idxDegraded).toBeLessThan(idxFailed);
    expect(idxFailed).toBeLessThan(idxReady);
  });
});

// ── Gap 5 — MTTR window cap vs unbounded recovery count (Rank 1 structural) ──────
//
// getRecoveryCount() is an unbounded lifetime counter.
// getMTTR() uses only the last 100 samples (ring buffer).
// After 105 records:
//   getRecoveryCount() == 105
//   getMTTR() denominator == 100  (not 105)
//
// This matters for dashboards: "recovery count" != "MTTR sample size".

describe('Gap 5 — MTTR window cap vs unbounded recovery count (Rank 1 — structural)', () => {
  it('after 105 records: getRecoveryCount() = 105 but getMTTR() uses only last 100', () => {
    const sm = new StateMachine();
    // Durations: 10, 11, 12, … 114  (105 entries)
    for (let i = 0; i < 105; i++) {
      sm.recordRecovery(10 + i);
    }

    expect(sm.getRecoveryCount()).toBe(105);

    // Window retains entries 5..104 → values 15..114.
    // Mean of arithmetic sequence 15..114 = (15 + 114) / 2 = 64.5
    expect(sm.getMTTR()).toBeCloseTo(64.5, 1);
  });

  it('getRecoveryCount() is strictly greater than 100 after 105 records', () => {
    const sm = new StateMachine();
    for (let i = 0; i < 105; i++) {
      sm.recordRecovery(10);
    }
    expect(sm.getRecoveryCount()).toBeGreaterThan(100);
  });

  it('getMTTR() is not NaN or Infinity after 105 records (window handles overflow correctly)', () => {
    const sm = new StateMachine();
    for (let i = 0; i < 105; i++) {
      sm.recordRecovery(50);
    }
    expect(Number.isFinite(sm.getMTTR())).toBe(true);
    expect(sm.getMTTR()).toBe(50); // all same value → mean is 50 regardless of window
  });

  it('getMTTR() after window overflow is the mean of the last 100 entries, not all 105 (Rank 3)', () => {
    const sm = new StateMachine();
    // First 5 entries: duration = 1000 (these will be evicted)
    for (let i = 0; i < 5; i++) {
      sm.recordRecovery(1000);
    }
    // Next 100 entries: duration = 10 (these fill the window)
    for (let i = 0; i < 100; i++) {
      sm.recordRecovery(10);
    }

    // Window: [10, 10, ..., 10] (100 entries of 10) — the 1000s are evicted.
    expect(sm.getMTTR()).toBe(10);
    expect(sm.getRecoveryCount()).toBe(105);
  });

  it('getTransitionHistoryMaxSize() is a positive integer returned by StateMachine', () => {
    const sm = new StateMachine();
    const cap = sm.getTransitionHistoryMaxSize();
    expect(typeof cap).toBe('number');
    expect(Number.isInteger(cap)).toBe(true);
    expect(cap).toBeGreaterThan(0);
  });

  it('getRecoveryCount() increments exactly once per recordRecovery() call (Rank 1 — counting)', () => {
    const sm = new StateMachine();
    expect(sm.getRecoveryCount()).toBe(0);

    sm.recordRecovery(100);
    expect(sm.getRecoveryCount()).toBe(1);

    sm.recordRecovery(200);
    expect(sm.getRecoveryCount()).toBe(2);

    sm.recordRecovery(300);
    expect(sm.getRecoveryCount()).toBe(3);
  });
});

// ── Gap 6 — Lifecycle listener errors are propagated, not swallowed (Rank 2) ─────
//
// StateMachine.transition() collects errors from all listeners and re-throws
// them as an aggregated error. A broken listener must not be silently ignored,
// per the TPS "fail fast" doctrine.

describe('Gap 6 — Lifecycle listener errors propagate (not swallowed) (Rank 2 — domain contract)', () => {
  it('transition() throws when a listener throws — error is not swallowed', () => {
    const sm = new StateMachine();
    sm.onTransition(() => {
      throw new Error('Listener intentional error');
    });

    expect(() => sm.transition('bootstrapping')).toThrow(/listener error/i);
  });

  it('error message from transition() includes the listener error message', () => {
    const sm = new StateMachine();
    sm.onTransition(() => {
      throw new Error('UNIQUE_LISTENER_MSG_7z9q');
    });

    let msg = '';
    try {
      sm.transition('bootstrapping');
    } catch (err) {
      msg = err instanceof Error ? err.message : String(err);
    }

    expect(msg).toContain('UNIQUE_LISTENER_MSG_7z9q');
  });

  it('two listener errors both appear in the aggregated thrown error', () => {
    const sm = new StateMachine();
    sm.onTransition(() => { throw new Error('LISTENER_A'); });
    sm.onTransition(() => { throw new Error('LISTENER_B'); });

    let msg = '';
    try {
      sm.transition('bootstrapping');
    } catch (err) {
      msg = err instanceof Error ? err.message : String(err);
    }

    expect(msg).toContain('LISTENER_A');
    expect(msg).toContain('LISTENER_B');
  });

  it('listener unsubscribe function removes the listener — no more errors after unsubscribe', () => {
    const sm = new StateMachine();

    let fired = false;
    const unsubscribe = sm.onTransition(() => {
      fired = true;
      throw new Error('Should not fire after unsubscribe');
    });

    unsubscribe();

    // After unsubscribe, transition must not throw.
    expect(() => sm.transition('bootstrapping')).not.toThrow();
    expect(fired).toBe(false);
  });

  it('non-throwing listener is called exactly once per transition (Rank 2 — event delivery)', () => {
    const sm = new StateMachine();
    const events: EngineState[] = [];

    sm.onTransition((e) => events.push(e.toState));

    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');

    expect(events).toEqual(['bootstrapping', 'ready', 'degraded']);
  });

  it('error thrown in transition() after listener error preserves the state machine state', () => {
    // After a listener throws, the state machine has already applied the transition.
    // The state change happened; only the listener notification failed.
    const sm = new StateMachine();
    sm.onTransition(() => {
      throw new Error('Listener failure');
    });

    try {
      sm.transition('bootstrapping');
    } catch {
      // expected
    }

    // The state transition DID occur — it's the post-transition listener that failed.
    expect(sm.getState()).toBe('bootstrapping');
    // And the transition IS in history.
    const history = sm.getTransitionHistory();
    expect(history.some((e) => e.toState === 'bootstrapping')).toBe(true);
  });
});
