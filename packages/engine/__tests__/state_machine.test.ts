/**
 * state_machine.test.ts
 * Tests for StateMachine class and state metadata
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StateMachine,
  STATE_METADATA,
  ALL_STATES,
  isOperationalState,
  isTerminalState,
  isProcessingState,
} from '../src/index';
import type { EngineState, LifecycleEvent } from '../src/index';

describe('StateMachine', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = new StateMachine();
  });

  describe('initial state', () => {
    it('should start in uninitialized state', () => {
      expect(sm.getState()).toBe('uninitialized');
    });

    it('should not be terminal', () => {
      expect(sm.isTerminal()).toBe(false);
    });

    it('should not be operational', () => {
      expect(sm.isOperational()).toBe(false);
    });

    it('should not be processing', () => {
      expect(sm.isProcessing()).toBe(false);
    });

    it('should have empty transition history', () => {
      expect(sm.getTransitionHistory()).toHaveLength(0);
    });
  });

  describe('valid transitions', () => {
    it('should allow uninitialized -> bootstrapping', () => {
      expect(sm.canTransition('bootstrapping')).toBe(true);
      sm.transition('bootstrapping');
      expect(sm.getState()).toBe('bootstrapping');
    });

    it('should allow bootstrapping -> ready', () => {
      sm.transition('bootstrapping');
      expect(sm.canTransition('ready')).toBe(true);
      sm.transition('ready');
      expect(sm.getState()).toBe('ready');
    });

    it('should allow ready -> planning', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      expect(sm.canTransition('planning')).toBe(true);
      sm.transition('planning');
      expect(sm.getState()).toBe('planning');
    });

    it('should allow planning -> running', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      sm.transition('planning');
      expect(sm.canTransition('running')).toBe(true);
      sm.transition('running');
      expect(sm.getState()).toBe('running');
    });

    it('should allow running -> watching', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      sm.transition('planning');
      sm.transition('running');
      expect(sm.canTransition('watching')).toBe(true);
      sm.transition('watching');
      expect(sm.getState()).toBe('watching');
    });

    it('should allow running -> ready (complete)', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      sm.transition('planning');
      sm.transition('running');
      sm.transition('ready');
      expect(sm.getState()).toBe('ready');
    });

    it('should allow degraded -> bootstrapping (recovery)', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      sm.transition('degraded');
      expect(sm.canTransition('bootstrapping')).toBe(true);
      sm.transition('bootstrapping');
      expect(sm.getState()).toBe('bootstrapping');
    });

    it('should allow failed -> bootstrapping (re-init)', () => {
      sm.transition('bootstrapping');
      sm.transition('failed');
      expect(sm.canTransition('bootstrapping')).toBe(true);
      sm.transition('bootstrapping');
      expect(sm.getState()).toBe('bootstrapping');
    });
  });

  describe('invalid transitions', () => {
    it('should reject uninitialized -> ready', () => {
      expect(sm.canTransition('ready')).toBe(false);
      expect(() => sm.transition('ready')).toThrow('Invalid state transition');
    });

    it('should reject uninitialized -> running', () => {
      expect(sm.canTransition('running')).toBe(false);
    });

    it('should reject bootstrapping -> running', () => {
      sm.transition('bootstrapping');
      expect(sm.canTransition('running')).toBe(false);
    });

    it('should allow ready -> running (direct execution)', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      expect(sm.canTransition('running')).toBe(true);
    });

    it('should reject watching -> planning', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      sm.transition('planning');
      sm.transition('running');
      sm.transition('watching');
      expect(sm.canTransition('planning')).toBe(false);
    });

    it('should include valid transitions in error message', () => {
      try {
        sm.transition('ready');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('bootstrapping');
        expect(err.message).toContain('Invalid state transition');
      }
    });
  });

  describe('getValidTransitions', () => {
    it('should return bootstrapping from uninitialized', () => {
      const valid = sm.getValidTransitions();
      expect(valid).toContain('bootstrapping');
      expect(valid).toHaveLength(1);
    });

    it('should return ready, failed, and degraded from bootstrapping', () => {
      sm.transition('bootstrapping');
      const valid = sm.getValidTransitions();
      expect(valid).toContain('ready');
      expect(valid).toContain('failed');
      expect(valid).toContain('degraded');
      expect(valid).toHaveLength(3);
    });

    it('should return planning, degraded, failed from ready', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      const valid = sm.getValidTransitions();
      expect(valid).toContain('planning');
      expect(valid).toContain('degraded');
      expect(valid).toContain('failed');
    });
  });

  describe('lifecycle events', () => {
    it('should emit events on transition', () => {
      const events: LifecycleEvent[] = [];
      sm.onTransition((event) => events.push(event));

      sm.transition('bootstrapping', 'Starting bootstrap');

      expect(events).toHaveLength(1);
      expect(events[0].fromState).toBe('uninitialized');
      expect(events[0].toState).toBe('bootstrapping');
      expect(events[0].reason).toBe('Starting bootstrap');
      expect(events[0].timestamp).toBeInstanceOf(Date);
    });

    it('should support multiple listeners', () => {
      let count1 = 0;
      let count2 = 0;
      sm.onTransition(() => count1++);
      sm.onTransition(() => count2++);

      sm.transition('bootstrapping');

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it('should support unsubscribe', () => {
      let count = 0;
      const unsub = sm.onTransition(() => count++);

      sm.transition('bootstrapping');
      expect(count).toBe(1);

      unsub();
      sm.transition('ready');
      expect(count).toBe(1); // No additional call
    });

    it('should not throw if listener throws', () => {
      sm.onTransition(() => {
        throw new Error('Listener error');
      });

      expect(() => sm.transition('bootstrapping')).not.toThrow();
    });
  });

  describe('transition history', () => {
    it('should record all transitions', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      sm.transition('planning');

      const history = sm.getTransitionHistory();
      expect(history).toHaveLength(3);
      expect(history[0].fromState).toBe('uninitialized');
      expect(history[0].toState).toBe('bootstrapping');
      expect(history[2].fromState).toBe('ready');
      expect(history[2].toState).toBe('planning');
    });

    it('should return a copy of history', () => {
      sm.transition('bootstrapping');
      const h1 = sm.getTransitionHistory();
      const h2 = sm.getTransitionHistory();
      expect(h1).not.toBe(h2);
      expect(h1).toEqual(h2);
    });
  });

  describe('state timing', () => {
    it('should track state entered time', () => {
      const before = new Date();
      sm.transition('bootstrapping');
      const enteredAt = sm.getStateEnteredAt();
      expect(enteredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should track state age', () => {
      sm.transition('bootstrapping');
      const age = sm.getStateAge();
      expect(age).toBeGreaterThanOrEqual(0);
    });

    it('should track last transition time', () => {
      expect(sm.getLastTransitionTime()).toBeNull();
      sm.transition('bootstrapping');
      expect(sm.getLastTransitionTime()).toBeInstanceOf(Date);
    });
  });

  describe('state classification', () => {
    it('should detect operational states', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      expect(sm.isOperational()).toBe(true);
    });

    it('should detect terminal states', () => {
      sm.transition('bootstrapping');
      sm.transition('failed');
      expect(sm.isTerminal()).toBe(true);
    });

    it('should detect processing states', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      sm.transition('planning');
      expect(sm.isProcessing()).toBe(true);
    });

    it('should detect degraded states', () => {
      sm.transition('bootstrapping');
      sm.transition('ready');
      sm.transition('degraded');
      expect(sm.isDegraded()).toBe(true);
    });
  });
});

describe('State Metadata', () => {
  it('should have metadata for all states', () => {
    for (const state of ALL_STATES) {
      expect(STATE_METADATA[state]).toBeDefined();
      expect(STATE_METADATA[state].name).toBe(state);
      expect(STATE_METADATA[state].description).toBeTruthy();
    }
  });

  it('should contain all expected states', () => {
    const expected: EngineState[] = [
      'uninitialized', 'bootstrapping', 'ready', 'planning',
      'running', 'watching', 'degraded', 'failed',
    ];
    expect(ALL_STATES).toEqual(expect.arrayContaining(expected));
    expect(ALL_STATES).toHaveLength(expected.length);
  });

  it('should mark ready and watching as operational', () => {
    expect(isOperationalState('ready')).toBe(true);
    expect(isOperationalState('watching')).toBe(true);
    expect(isOperationalState('uninitialized')).toBe(false);
    expect(isOperationalState('failed')).toBe(false);
  });

  it('should mark only failed as terminal', () => {
    expect(isTerminalState('failed')).toBe(true);
    expect(isTerminalState('ready')).toBe(false);
    expect(isTerminalState('degraded')).toBe(false);
  });

  it('should mark active states as processing', () => {
    expect(isProcessingState('bootstrapping')).toBe(true);
    expect(isProcessingState('planning')).toBe(true);
    expect(isProcessingState('running')).toBe(true);
    expect(isProcessingState('watching')).toBe(true);
    expect(isProcessingState('ready')).toBe(false);
    expect(isProcessingState('degraded')).toBe(false);
  });
});
