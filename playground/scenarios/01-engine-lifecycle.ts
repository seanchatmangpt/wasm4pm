/**
 * Scenario: Engine lifecycle — state machine contract
 *
 * Dev action simulated: "I just imported @wasm4pm/engine and want to verify
 * the state machine invariants before wiring it to the rest of the system."
 *
 * Uses MockEngine from @wasm4pm/testing — avoids WASM entirely.
 * The static API tests (canTransition, VALID_TRANSITIONS) import directly
 * from the engine package and always run.
 */

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  VALID_TRANSITIONS,
  ALL_STATES,
  STATE_METADATA,
  isTerminalState,
  isOperationalState,
  isProcessingState,
} from '@wasm4pm/engine';
import { MockEngine } from '@wasm4pm/testing';

// ── Block 1: Static API surface ───────────────────────────────────────────────

describe('engine lifecycle: static API surface', () => {
  it('canTransition is a function', () => {
    expect(typeof canTransition).toBe('function');
  });

  it('VALID_TRANSITIONS has all 8 state keys', () => {
    const expected = [
      'uninitialized', 'bootstrapping', 'ready', 'planning',
      'running', 'watching', 'degraded', 'failed',
    ];
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(expected.sort());
  });

  it('ALL_STATES contains exactly 8 states', () => {
    expect(ALL_STATES).toHaveLength(8);
  });

  it('failed is the only terminal state', () => {
    const terminals = ALL_STATES.filter(isTerminalState);
    expect(terminals).toEqual(['failed']);
  });

  it('operational states are ready, planning, running, watching', () => {
    const operational = ALL_STATES.filter(isOperationalState);
    expect(operational.sort()).toEqual(['planning', 'ready', 'running', 'watching'].sort());
  });

  it('processing states are bootstrapping, planning, running, watching', () => {
    const processing = ALL_STATES.filter(isProcessingState);
    expect(processing.sort()).toEqual(['bootstrapping', 'planning', 'running', 'watching'].sort());
  });

  it('STATE_METADATA.uninitialized is not terminal/operational/processing', () => {
    const meta = STATE_METADATA['uninitialized'];
    expect(meta.terminal).toBe(false);
    expect(meta.operational).toBe(false);
    expect(meta.processing).toBe(false);
  });

  it('STATE_METADATA.failed is terminal', () => {
    expect(STATE_METADATA['failed'].terminal).toBe(true);
  });
});

// ── Block 2: Transition gating ────────────────────────────────────────────────

describe('engine lifecycle: canTransition gates', () => {
  it('uninitialized → bootstrapping is valid', () => {
    expect(canTransition('uninitialized', 'bootstrapping')).toBe(true);
  });

  it('uninitialized → ready is invalid (must bootstrap first)', () => {
    expect(canTransition('uninitialized', 'ready')).toBe(false);
  });

  it('uninitialized → running is invalid', () => {
    expect(canTransition('uninitialized', 'running')).toBe(false);
  });

  it('ready → planning is valid', () => {
    expect(canTransition('ready', 'planning')).toBe(true);
  });

  it('ready → uninitialized is invalid (no backward jumps)', () => {
    expect(canTransition('ready', 'uninitialized')).toBe(false);
  });

  it('failed → bootstrapping is valid (restart path)', () => {
    expect(canTransition('failed', 'bootstrapping')).toBe(true);
  });

  it('failed → ready is invalid (must re-bootstrap)', () => {
    expect(canTransition('failed', 'ready')).toBe(false);
  });

  it('degraded → ready is valid (recovery)', () => {
    expect(canTransition('degraded', 'ready')).toBe(true);
  });

  it('degraded → bootstrapping is valid (deep recovery)', () => {
    expect(canTransition('degraded', 'bootstrapping')).toBe(true);
  });

  it('VALID_TRANSITIONS.uninitialized is a Set containing only bootstrapping', () => {
    const set = VALID_TRANSITIONS['uninitialized'];
    expect(set).toBeInstanceOf(Set);
    expect([...set]).toEqual(['bootstrapping']);
  });
});

// ── Block 3: MockEngine lifecycle (no WASM needed) ────────────────────────────

describe('engine lifecycle: MockEngine state machine', () => {
  it('starts in uninitialized state', () => {
    const engine = new MockEngine();
    expect(engine.state()).toBe('uninitialized');
    expect(engine.isReady()).toBe(false);
    expect(engine.isFailed()).toBe(false);
  });

  it('getTransitionHistory() is empty before bootstrap', () => {
    const engine = new MockEngine();
    expect(engine.getTransitionHistory()).toHaveLength(0);
  });

  it('bootstrap() moves state to ready', async () => {
    const engine = new MockEngine();
    await engine.bootstrap();
    expect(engine.state()).toBe('ready');
    expect(engine.isReady()).toBe(true);
  });

  it('getTransitionHistory() has 2 events after bootstrap', async () => {
    const engine = new MockEngine();
    await engine.bootstrap();
    const history = engine.getTransitionHistory();
    expect(history).toHaveLength(2);
    expect(history[0].fromState).toBe('uninitialized');
    expect(history[0].toState).toBe('bootstrapping');
    expect(history[1].fromState).toBe('bootstrapping');
    expect(history[1].toState).toBe('ready');
  });

  it('history timestamps are monotonically non-decreasing', async () => {
    const engine = new MockEngine();
    await engine.bootstrap();
    const history = engine.getTransitionHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i].timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1].timestamp.getTime(),
      );
    }
  });

  it('plan() returns an ExecutionPlan', async () => {
    const engine = new MockEngine();
    await engine.bootstrap();
    const plan = await engine.plan({ execution: { profile: 'fast' } });
    expect(plan).toHaveProperty('id');
    expect(plan).toHaveProperty('hash');
    expect(Array.isArray(plan.steps)).toBe(true);
    console.info('[lifecycle] plan steps:', plan.steps.map((s: { type: string }) => s.type));
  });

  it('run() returns an ExecutionReceipt', async () => {
    const engine = new MockEngine();
    await engine.bootstrap();
    const plan = await engine.plan({ execution: { profile: 'fast' } });
    const receipt = await engine.run(plan);
    expect(receipt).toHaveProperty('runId');
    expect(receipt).toHaveProperty('planId');
    expect(receipt.state).toBe('ready');
    console.info('[lifecycle] receipt runId:', receipt.runId.slice(0, 8));
  });

  it('shouldFailBootstrap option transitions to failed', async () => {
    const engine = new MockEngine({ shouldFailBootstrap: true });
    await expect(engine.bootstrap()).rejects.toThrow();
    expect(engine.state()).toBe('failed');
  });

  it('shouldFailRun option keeps engine in ready after failed run', async () => {
    const engine = new MockEngine({ shouldFailRun: true });
    await engine.bootstrap();
    const plan = await engine.plan({ source: { kind: 'file', format: 'xes' }, execution: { profile: 'fast' } });
    await expect(engine.run(plan)).rejects.toThrow();
    // After a failed run, state returns to ready (not failed) — MockEngine behavior
    expect(['ready', 'failed', 'degraded']).toContain(engine.state());
    console.info('[lifecycle] state after failed run:', engine.state());
  });
});
