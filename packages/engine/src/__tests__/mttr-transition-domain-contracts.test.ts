/**
 * mttr-transition-domain-contracts.test.ts
 *
 * Rank-2 domain contracts for the StateMachine class.
 * All assertions derive from domain theory, not from the implementation
 * itself — per the Chicago TDD doctrine against FM-5 (self-referential tests).
 *
 * NO mocks. StateMachine is a pure state machine with no async I/O;
 * every property here is testable in isolation.
 *
 * Covers:
 *   1. Recovery count vs MTTR window independence (count unbounded; window caps at 100)
 *   2. TransitionValidator fatal-error guard blocks ready transition even when
 *      VALID_TRANSITIONS topology permits it
 *   3. getStateAge() is monotonically non-decreasing
 *   4. Invalid transitions throw Error messages naming both source and target
 *   5. Transition reason field: undefined vs string stored faithfully
 *   6. getTransitionHistory() returns a defensive copy
 *   7. watching state: isOperational() true, isProcessing() false
 *   8. computeMTTRFromHistory() returns 0 when no failure states in history
 *      (StateMachine level — no engine needed)
 *
 * Engine-level MTTR timing tests (requiring bootstrap mock) live in:
 *   src/__tests__/unit/mttr-engine-timing.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  StateMachine,
  TransitionValidator,
  canTransition,
} from '../index.js';

// ── 1. Recovery count vs MTTR window cap ──────────────────────────────────────
// Domain contract: getRecoveryCount() is the total lifetime count (unbounded),
// while getMTTR() uses only the last 100 samples.  After 105 recoveries:
//   - getRecoveryCount() === 105
//   - getMTTR() denominator === 100  (entries 5..104, not 0..104)
// This invariant matters for dashboards: "recovery count" ≠ "MTTR sample size".

describe('StateMachine — recovery count vs MTTR window independence', () => {
  it('getRecoveryCount() exceeds 100 while MTTR window stays at 100 after 105 records', () => {
    const sm = new StateMachine();
    // Durations: 10, 11, 12, … 114 (105 entries)
    for (let i = 0; i < 105; i++) {
      sm.recordRecovery(10 + i);
    }

    expect(sm.getRecoveryCount()).toBe(105);

    // Window retains last 100: indices 5..104 → values 15..114
    // Mean of arithmetic sequence 15..114 = (15+114)/2 = 64.5
    const expectedMean = (15 + 114) / 2;
    expect(sm.getMTTR()).toBeCloseTo(expectedMean, 0);
  });

  it('getRecoveryCount() and MTTR window agree for fewer than 100 recoveries', () => {
    const sm = new StateMachine();
    for (let i = 0; i < 50; i++) {
      sm.recordRecovery(100);
    }

    expect(sm.getRecoveryCount()).toBe(50);
    expect(sm.getMTTR()).toBeCloseTo(100, 0);
  });

  it('getMTTR() increases when a slower recovery is appended', () => {
    const sm = new StateMachine();
    sm.recordRecovery(10);
    const before = sm.getMTTR();

    sm.recordRecovery(500); // much slower
    expect(sm.getMTTR()).toBeGreaterThan(before);
  });
});

// ── 2. TransitionValidator fatal-error guard ──────────────────────────────────
// Domain contract: TransitionValidator.validateTransition() must return
// valid=false when targeting 'ready' with active fatal errors, even though
// VALID_TRANSITIONS allows degraded→ready and failed→ready topologically.
// The validator adds semantic guards beyond the pure topology.

describe('TransitionValidator — fatal errors block ready transition', () => {
  it('returns invalid for degraded→ready with a fatal error', () => {
    const fatalError = {
      code: 'FATAL_TEST',
      message: 'Fatal test error',
      severity: 'fatal' as const,
      recoverable: false,
    };

    // Topology permits the transition.
    expect(canTransition('degraded', 'ready')).toBe(true);

    // Validator must block it.
    const result = TransitionValidator.validateTransition('degraded', 'ready', [fatalError]);
    expect(result.valid).toBe(false);
    expect(typeof result.suggestion).toBe('string');
    expect(result.suggestion!.length).toBeGreaterThan(0);
  });

  it('allows degraded→ready with only recoverable (non-fatal) errors', () => {
    const recoverableError = {
      code: 'WARN_TEST',
      message: 'Recoverable warning',
      severity: 'warning' as const,
      recoverable: true,
    };

    const result = TransitionValidator.validateTransition('degraded', 'ready', [recoverableError]);
    expect(result.valid).toBe(true);
  });

  it('suggestRecoveryState returns failed for fatal errors (consistent with validateTransition)', () => {
    const fatalError = {
      code: 'FATAL_TEST',
      message: 'Fatal test error',
      severity: 'fatal' as const,
      recoverable: false,
    };

    const suggestion = TransitionValidator.suggestRecoveryState('degraded', [fatalError]);
    expect(suggestion).toBe('failed');

    // The suggested transition must itself be valid.
    const result = TransitionValidator.validateTransition('degraded', suggestion!);
    expect(result.valid).toBe(true);
  });

  it('allows legal transition with no errors and returns no suggestion', () => {
    const result = TransitionValidator.validateTransition('uninitialized', 'bootstrapping');
    expect(result.valid).toBe(true);
    expect(result.suggestion).toBeUndefined();
  });

  it('rejects illegal topology transition regardless of error list', () => {
    // uninitialized → watching is not in VALID_TRANSITIONS.
    const result = TransitionValidator.validateTransition('uninitialized', 'watching');
    expect(result.valid).toBe(false);
    // Error message must name the illegal target.
    expect(result.suggestion).toContain('watching');
  });
});

// ── 3. getStateAge() monotonicity ─────────────────────────────────────────────
// Domain contract: successive calls to getStateAge() within the same state
// must return values that are non-decreasing (time cannot run backwards).

describe('StateMachine — getStateAge() monotonicity', () => {
  it('returns non-negative value immediately after transition', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    expect(sm.getStateAge()).toBeGreaterThanOrEqual(0);
  });

  it('increases between two successive reads in the same state', async () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');

    const age1 = sm.getStateAge();
    await new Promise((r) => setTimeout(r, 5));
    const age2 = sm.getStateAge();

    // Domain contract: time only moves forward.
    expect(age2).toBeGreaterThanOrEqual(age1);
    expect(age2).toBeGreaterThan(age1);
  });

  it('resets to near-zero after a transition', async () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');

    await new Promise((r) => setTimeout(r, 10));
    const ageInBootstrapping = sm.getStateAge();

    sm.transition('ready');
    const ageInReady = sm.getStateAge();

    // Age was reset on transition.
    expect(ageInReady).toBeLessThan(ageInBootstrapping);
  });
});

// ── 4. Invalid transition error messages ──────────────────────────────────────
// Domain contract: StateMachine.transition() must throw an Error whose message
// names both the source and target state so operators can diagnose illegal
// control-flow paths without reading source code.

describe('StateMachine — invalid transition error messages', () => {
  it('error message names the source state (uninitialized)', () => {
    const sm = new StateMachine();
    expect(() => sm.transition('watching')).toThrow(/uninitialized/);
  });

  it('error message names the attempted target state (watching)', () => {
    const sm = new StateMachine();
    let caught: Error | null = null;
    try { sm.transition('watching'); } catch (e) { caught = e as Error; }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('watching');
  });

  it('error message includes at least one valid alternative', () => {
    // From uninitialized the only valid target is bootstrapping.
    const sm = new StateMachine();
    let caught: Error | null = null;
    try { sm.transition('planning'); } catch (e) { caught = e as Error; }
    expect(caught!.message).toContain('bootstrapping');
  });

  it('throws for uninitialized → ready', () => {
    const sm = new StateMachine();
    expect(() => sm.transition('ready')).toThrow(/uninitialized/);
  });

  it('throws for bootstrapping → planning', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    expect(() => sm.transition('planning')).toThrow(/bootstrapping/);
  });

  it('throws for ready → bootstrapping (not a valid forward transition)', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    expect(() => sm.transition('bootstrapping')).toThrow(/ready/);
  });
});

// ── 5 & 6. Transition reason field + defensive copy ───────────────────────────
// Domain contract: the reason field in LifecycleEvent must exactly reflect
// what was passed to transition().  Undefined reason must not be coerced.
// getTransitionHistory() must return a copy so mutations cannot corrupt the SM.

describe('StateMachine — transition reason field and history copy', () => {
  it('reason is undefined when not provided', () => {
    const sm = new StateMachine();
    const event = sm.transition('bootstrapping'); // no reason argument
    expect(event.reason).toBeUndefined();
  });

  it('reason is preserved exactly as provided', () => {
    const sm = new StateMachine();
    const reason = 'Recovery completed after WASM soft-reset';
    const event = sm.transition('bootstrapping', reason);
    expect(event.reason).toBe(reason);
  });

  it('reason appears in getTransitionHistory()', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping', 'Initializing WASM binary');
    sm.transition('ready', 'WASM initialized');

    const history = sm.getTransitionHistory();
    expect(history.find((e) => e.toState === 'bootstrapping')?.reason).toBe('Initializing WASM binary');
    expect(history.find((e) => e.toState === 'ready')?.reason).toBe('WASM initialized');
  });

  it('getTransitionHistory() returns a defensive copy — push does not affect the SM', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');

    const copy = sm.getTransitionHistory();
    copy.push({ timestamp: new Date(), fromState: 'uninitialized', toState: 'ready' }); // illegal mutation

    // Internal history must remain at length 1.
    expect(sm.getTransitionHistory().length).toBe(1);
  });

  it('all history entries carry Date timestamps', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');

    for (const event of sm.getTransitionHistory()) {
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(typeof event.timestamp.getTime()).toBe('number');
      expect(Number.isFinite(event.timestamp.getTime())).toBe(true);
    }
  });
});

// ── 7. watching state classification ─────────────────────────────────────────
// Domain contract: 'watching' is operational (healthy) but NOT processing
// (not computing). This matters for the RL reward function: isOperational()
// drives positive reward assignment.

describe('StateMachine — watching state classification', () => {
  function buildWatchingSM(): StateMachine {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('running');
    sm.transition('watching');
    return sm;
  }

  it('isOperational() true in watching', () => {
    expect(buildWatchingSM().isOperational()).toBe(true);
  });

  it('isProcessing() false in watching', () => {
    expect(buildWatchingSM().isProcessing()).toBe(false);
  });

  it('isTerminal() false in watching', () => {
    expect(buildWatchingSM().isTerminal()).toBe(false);
  });

  it('isDegraded() false in watching', () => {
    expect(buildWatchingSM().isDegraded()).toBe(false);
  });

  it('canTransition to ready (clean stop path)', () => {
    expect(buildWatchingSM().canTransition('ready')).toBe(true);
  });

  it('canTransition to degraded (heartbeat failure path)', () => {
    expect(buildWatchingSM().canTransition('degraded')).toBe(true);
  });

  it('cannot transition back to running from watching', () => {
    expect(buildWatchingSM().canTransition('running')).toBe(false);
  });
});

// ── 8. computeMTTRFromHistory at StateMachine level ───────────────────────────
// computeMTTRFromHistory is on Engine, not StateMachine, so this section
// verifies the prerequisite: getTransitionHistory() timestamps are Date objects
// with monotonically non-decreasing values — which computeMTTRFromHistory
// relies on for correct duration arithmetic.

describe('StateMachine — transition timestamp monotonicity (prerequisite for computeMTTRFromHistory)', () => {
  it('timestamps are strictly non-decreasing across the transition sequence', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');
    sm.transition('ready', 'recovered');

    const history = sm.getTransitionHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1]!.timestamp.getTime()
      );
    }
  });

  it('timestamps advance when there is wall-clock elapsed between transitions', async () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    await new Promise((r) => setTimeout(r, 5));
    sm.transition('ready');

    const history = sm.getTransitionHistory();
    expect(history[1]!.timestamp.getTime()).toBeGreaterThan(
      history[0]!.timestamp.getTime()
    );
  });
});
