/**
 * state-machine-rank1.test.ts — Rank-1 / Rank-2 oracle tests.
 * Imports source directly (not via ./index.js) to avoid pulling the optional
 * @wasm4pm/kernel transitive dependency from federation/null-backend.
 */

import { describe, it, expect } from 'vitest';
import type { EngineState } from '@wasm4pm/contracts';
import { VALID_TRANSITIONS, canTransition, getValidTransitions } from '../transitions.js';
import { StateMachine } from '../lifecycle.js';
// Import the .ts source directly to bypass any stale compiled .js sitting
// next to the .ts source (a known repo-hygiene quirk).
import { bootstrapEngine } from '../bootstrap.js';

const ALL_STATES: EngineState[] = [
  'uninitialized',
  'bootstrapping',
  'ready',
  'planning',
  'running',
  'watching',
  'degraded',
  'failed',
];

describe('VALID_TRANSITIONS — Rank-1 reachability', () => {
  it('every source and target in VALID_TRANSITIONS is a real EngineState', () => {
    for (const src of Object.keys(VALID_TRANSITIONS)) {
      expect(ALL_STATES).toContain(src as EngineState);
    }
    for (const targets of Object.values(VALID_TRANSITIONS)) {
      for (const t of targets) {
        expect(ALL_STATES).toContain(t as EngineState);
      }
    }
  });

  it('every state is reachable from uninitialized via BFS', () => {
    // Unreachable states are defects, not features.
    const visited = new Set<EngineState>(['uninitialized']);
    const q: EngineState[] = ['uninitialized'];
    while (q.length) {
      for (const n of VALID_TRANSITIONS[q.shift()!]) {
        if (!visited.has(n)) {
          visited.add(n);
          q.push(n);
        }
      }
    }
    for (const s of ALL_STATES) expect(visited.has(s), `unreachable: ${s}`).toBe(true);
  });

  it('declared recovery edges match the CLAUDE.md contract', () => {
    // failed → bootstrapping | ready ; degraded → bootstrapping | ready
    expect(canTransition('failed', 'ready')).toBe(true);
    expect(canTransition('failed', 'bootstrapping')).toBe(true);
    expect(canTransition('degraded', 'ready')).toBe(true);
    expect(canTransition('degraded', 'bootstrapping')).toBe(true);
    // uninitialized has only one out-edge (catches accidental shortcuts).
    expect(getValidTransitions('uninitialized')).toEqual(['bootstrapping']);
  });
});

describe('StateMachine — Rank-1 history & MTTR', () => {
  it('captures every successful transition exactly once, in order', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    sm.transition('ready');
    sm.transition('planning');
    sm.transition('ready');
    const hist = sm.getTransitionHistory();
    expect(hist.map((e) => e.toState)).toEqual(['bootstrapping', 'ready', 'planning', 'ready']);
    expect(hist[0].fromState).toBe('uninitialized');
    expect(hist[3].fromState).toBe('planning');
  });

  it('returns a defensive copy and never records invalid attempts', () => {
    const sm = new StateMachine();
    sm.transition('bootstrapping');
    // Mutating the snapshot does not corrupt the machine.
    const snap = sm.getTransitionHistory();
    snap.length = 0;
    expect(sm.getTransitionHistory().length).toBe(1);
    // Invalid attempt throws AND does not pollute history or state.
    expect(() => sm.transition('running')).toThrow();
    expect(sm.getTransitionHistory().length).toBe(1);
    expect(sm.getState()).toBe('bootstrapping');
  });

  it('getMTTR is the arithmetic mean of recorded durations (not hardcoded)', () => {
    const sm = new StateMachine();
    expect(sm.getMTTR()).toBe(0);
    expect(sm.getRecoveryCount()).toBe(0);
    sm.recordRecovery(100);
    sm.recordRecovery(200);
    sm.recordRecovery(300);
    expect(sm.getMTTR()).toBe(200); // mean(100, 200, 300)
    expect(sm.getRecoveryCount()).toBe(3);
  });

  it('keeps recovery history bounded at 100 (no unbounded growth)', () => {
    const sm = new StateMachine();
    for (let i = 0; i < 150; i++) sm.recordRecovery(i);
    expect(sm.getRecoveryCount()).toBe(150); // counter is monotone
    // Buffer trimmed to the last 100 entries: indices 50..149, mean = 99.5.
    expect(sm.getMTTR()).toBeCloseTo(99.5, 5);
  });
});

describe('bootstrapEngine — Rank-2 atomicity on kernel failure', () => {
  // Minimal fakes (no kernel-package dependency).
  const makeLoader = () => {
    const state = { initialized: false, softResetCalls: 0 };
    return Object.assign(state, {
      async init() {
        state.initialized = true;
      },
      get() {
        return { memory: { buffer: new ArrayBuffer(1024) } };
      },
      isInitialized() {
        return state.initialized;
      },
      softReset() {
        state.softResetCalls++;
        state.initialized = false;
      },
    });
  };
  const failingKernel = {
    async init() {
      throw new Error('kernel boom');
    },
    isReady: () => false,
  };
  const notReadyKernel = { async init() {}, isReady: () => false };
  const okKernel = { async init() {}, isReady: () => true };

  it('rolls back via softReset when kernel.init throws', async () => {
    const loader = makeLoader();
    await expect(bootstrapEngine(failingKernel as any, loader as any)).rejects.toThrow(/boom/);
    expect(loader.softResetCalls).toBe(1);
    expect(loader.isInitialized()).toBe(false);
  });

  it('rolls back when kernel.isReady() is false post-init', async () => {
    const loader = makeLoader();
    await expect(bootstrapEngine(notReadyKernel as any, loader as any)).rejects.toThrow(
      /kernel not ready/i
    );
    expect(loader.softResetCalls).toBe(1);
  });

  it('does NOT call softReset on a successful bootstrap', async () => {
    const loader = makeLoader();
    await bootstrapEngine(okKernel as any, loader as any);
    expect(loader.softResetCalls).toBe(0);
    expect(loader.isInitialized()).toBe(true);
  });

  it('does not mask the original kernel error if softReset itself throws', async () => {
    const loader = makeLoader();
    (loader as any).softReset = () => {
      throw new Error('reset boom');
    };
    await expect(bootstrapEngine(failingKernel as any, loader as any)).rejects.toThrow(/boom/);
  });
});
