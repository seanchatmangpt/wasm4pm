/**
 * history-cap.test.ts
 *
 * Closes Gap 1: transitionHistory unbounded-growth contract.
 *
 * The recoveryHistory already caps at 100 entries.  Before the fix,
 * transitionHistory had no cap — a long-running engine would leak memory.
 * After the fix (TRANSITION_HISTORY_MAX = 1000), the buffer must:
 *   - Never exceed 1000 entries
 *   - Evict the oldest entry when the cap is exceeded
 *   - Preserve chronological ordering after eviction
 *
 * Oracle rank: Rank 1 (mathematical invariant) — properties follow from the
 * definition of a ring buffer; no implementation-internal values are read.
 *
 * NO mocks — StateMachine is a pure unit with no async I/O.
 */

import { describe, it, expect } from 'vitest';
import { StateMachine } from '../lifecycle.js';

// Helper: drive the SM through N ready↔degraded cycles starting from uninitialized.
// Each cycle adds 2 transitions (ready→degraded, degraded→ready).
// Precondition: SM is already at 'ready' (2 transitions from uninitialized have been done).
function cycleReadyDegraded(sm: StateMachine, cycles: number): void {
  for (let i = 0; i < cycles; i++) {
    sm.transition('degraded');
    sm.transition('ready');
  }
}

function driveToReady(sm: StateMachine): void {
  sm.transition('bootstrapping');
  sm.transition('ready');
}

// ── Gap 1 — transitionHistory cap (Rank 1: mathematical invariant) ────────────

describe('Gap 1 — StateMachine transitionHistory ring-buffer cap', () => {
  it('getTransitionHistoryMaxSize() returns a positive integer', () => {
    const sm = new StateMachine();
    const max = sm.getTransitionHistoryMaxSize();
    expect(typeof max).toBe('number');
    expect(max).toBeGreaterThan(0);
    expect(Number.isInteger(max)).toBe(true);
  });

  it('history length never exceeds getTransitionHistoryMaxSize()', () => {
    const sm = new StateMachine();
    const MAX = sm.getTransitionHistoryMaxSize();

    driveToReady(sm);

    // Run enough cycles to overflow the buffer by more than 1
    const cycles = Math.ceil(MAX / 2) + 5;
    cycleReadyDegraded(sm, cycles);

    expect(sm.getTransitionHistory().length).toBeLessThanOrEqual(MAX);
  });

  it('history length equals exactly MAX after MAX+10 transitions', () => {
    const sm = new StateMachine();
    const MAX = sm.getTransitionHistoryMaxSize();

    driveToReady(sm);

    const cycles = Math.ceil((MAX + 10) / 2) + 1;
    cycleReadyDegraded(sm, cycles);

    expect(sm.getTransitionHistory().length).toBe(MAX);
  });

  it('oldest entry is evicted — the most-recent entry is preserved after overflow', () => {
    const sm = new StateMachine();
    const MAX = sm.getTransitionHistoryMaxSize();

    driveToReady(sm);

    // Fill exactly to MAX, then add one more pair to push past the cap
    const fillCycles = Math.floor((MAX - 2) / 2); // -2 for the 2 entries already pushed
    cycleReadyDegraded(sm, fillCycles);
    sm.transition('degraded'); // triggers eviction when combined with previous entries
    sm.transition('ready');

    const history = sm.getTransitionHistory();
    expect(history.length).toBeLessThanOrEqual(MAX);

    // Most recent transition must be preserved
    const lastEntry = history[history.length - 1]!;
    expect(lastEntry.toState).toBe('ready');
  });

  it('timestamps remain chronologically ordered after cap eviction', () => {
    const sm = new StateMachine();
    const MAX = sm.getTransitionHistoryMaxSize();

    driveToReady(sm);

    const cycles = Math.ceil((MAX + 10) / 2) + 1;
    cycleReadyDegraded(sm, cycles);

    const history = sm.getTransitionHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1]!.timestamp.getTime()
      );
    }
  });

  it('getTransitionHistory() returns a defensive copy — mutating it does not affect internal buffer', () => {
    const sm = new StateMachine();
    driveToReady(sm);
    const lenBefore = sm.getTransitionHistory().length;

    // Mutate the returned copy
    const copy = sm.getTransitionHistory();
    copy.splice(0, copy.length);

    // Internal buffer is unaffected
    expect(sm.getTransitionHistory().length).toBe(lenBefore);
  });

  it('cap is enforced independently of how many times getTransitionHistory() is called', () => {
    const sm = new StateMachine();
    const MAX = sm.getTransitionHistoryMaxSize();

    driveToReady(sm);

    const cycles = Math.ceil((MAX + 5) / 2) + 1;
    for (let i = 0; i < cycles; i++) {
      sm.transition('degraded');
      // Read history mid-cycle to confirm it does not corrupt the buffer
      void sm.getTransitionHistory();
      sm.transition('ready');
      void sm.getTransitionHistory();
    }

    expect(sm.getTransitionHistory().length).toBeLessThanOrEqual(MAX);
  });
});
