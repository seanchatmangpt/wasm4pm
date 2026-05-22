/**
 * recovery-paths.test.ts
 * Unit tests for StateMachine recovery tracking and MTTR constraint.
 *
 * These tests use no mocks — StateMachine is tested directly as a unit.
 * Engine-level recovery integration tests live in src/engine-recovery.test.ts
 * (alongside engine.test.ts) where bootstrap mocking is permissible.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateMachine } from '../index.js';

// ── StateMachine MTTR unit tests ─────────────────────────────────────────────

describe('StateMachine — getMTTR()', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = new StateMachine();
  });

  it('returns 0 when no recoveries recorded', () => {
    expect(sm.getMTTR()).toBe(0);
  });

  it('returns the single recorded recovery duration', () => {
    sm.recordRecovery(120);
    expect(sm.getMTTR()).toBe(120);
  });

  it('returns the mean of multiple recorded recovery durations', () => {
    sm.recordRecovery(100);
    sm.recordRecovery(200);
    sm.recordRecovery(300);
    expect(sm.getMTTR()).toBe(200);
  });

  it('MTTR is below the 1000ms SLA threshold for fast recoveries', () => {
    [50, 80, 100, 120, 90].forEach((d) => sm.recordRecovery(d));
    expect(sm.getMTTR()).toBeLessThan(1000);
  });

  it('tracks recovery count independently of history window', () => {
    sm.recordRecovery(100);
    sm.recordRecovery(200);
    expect(sm.getRecoveryCount()).toBe(2);
  });

  it('caps history at 100 entries to prevent unbounded growth', () => {
    for (let i = 0; i < 105; i++) {
      sm.recordRecovery(10);
    }
    expect(sm.getRecoveryCount()).toBe(105);
    expect(sm.getMTTR()).toBeGreaterThan(0);
  });

  it('getMTTR increases when a slow recovery is added', () => {
    sm.recordRecovery(100);
    const mttrBefore = sm.getMTTR();
    sm.recordRecovery(900);
    expect(sm.getMTTR()).toBeGreaterThan(mttrBefore);
  });
});

// ── StateMachine — recovery transitions ──────────────────────────────────────

describe('StateMachine — recovery transition validity', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = new StateMachine();
  });

  it('degraded → ready is a valid transition', () => {
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');
    expect(sm.canTransition('ready')).toBe(true);
  });

  it('degraded → bootstrapping is a valid transition', () => {
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');
    expect(sm.canTransition('bootstrapping')).toBe(true);
  });

  it('failed → ready is a valid transition (fast recovery path)', () => {
    sm.transition('bootstrapping');
    sm.transition('failed');
    expect(sm.canTransition('ready')).toBe(true);
  });

  it('failed → bootstrapping is a valid transition (re-init path)', () => {
    sm.transition('bootstrapping');
    sm.transition('failed');
    expect(sm.canTransition('bootstrapping')).toBe(true);
  });

  it('uninitialized → degraded is NOT a valid transition', () => {
    expect(sm.canTransition('degraded')).toBe(false);
  });

  it('isDegraded() reflects degraded state', () => {
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');
    expect(sm.isDegraded()).toBe(true);
    expect(sm.isOperational()).toBe(false);
    expect(sm.isTerminal()).toBe(false);
  });

  it('isTerminal() reflects failed state', () => {
    sm.transition('bootstrapping');
    sm.transition('failed');
    expect(sm.isTerminal()).toBe(true);
    expect(sm.isOperational()).toBe(false);
    expect(sm.isDegraded()).toBe(false);
  });

  it('recovery transition is recorded in history', () => {
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');
    sm.transition('ready', 'Recovery completed');

    const history = sm.getTransitionHistory();
    const recoveryEntry = history.find(
      (e) => e.fromState === 'degraded' && e.toState === 'ready'
    );
    expect(recoveryEntry).toBeDefined();
    expect(recoveryEntry?.reason).toBe('Recovery completed');
  });

  it('all transitions carry timestamps', () => {
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('degraded');
    sm.transition('ready');

    for (const event of sm.getTransitionHistory()) {
      expect(event.timestamp).toBeInstanceOf(Date);
    }
  });
});
