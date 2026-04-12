/**
 * transitions.test.ts
 * Tests for transition rules, validation, and recovery suggestions
 */

import { describe, it, expect } from 'vitest';
import {
  VALID_TRANSITIONS,
  canTransition,
  getValidTransitions,
  TransitionValidator,
} from '../src/index';
import type { EngineState } from '../src/index';

describe('Transition Map', () => {
  it('should define transitions for all states', () => {
    const allStates: EngineState[] = [
      'uninitialized', 'bootstrapping', 'ready', 'planning',
      'running', 'watching', 'degraded', 'failed',
    ];
    for (const state of allStates) {
      expect(VALID_TRANSITIONS[state]).toBeDefined();
      expect(VALID_TRANSITIONS[state]).toBeInstanceOf(Set);
    }
  });

  it('should only allow bootstrapping from uninitialized', () => {
    expect(VALID_TRANSITIONS['uninitialized'].size).toBe(1);
    expect(VALID_TRANSITIONS['uninitialized'].has('bootstrapping')).toBe(true);
  });

  it('should allow ready or failed from bootstrapping', () => {
    expect(VALID_TRANSITIONS['bootstrapping'].has('ready')).toBe(true);
    expect(VALID_TRANSITIONS['bootstrapping'].has('failed')).toBe(true);
    expect(VALID_TRANSITIONS['bootstrapping'].has('running')).toBe(false);
  });

  it('should allow planning from ready', () => {
    expect(VALID_TRANSITIONS['ready'].has('planning')).toBe(true);
  });

  it('should allow running from planning', () => {
    expect(VALID_TRANSITIONS['planning'].has('running')).toBe(true);
  });

  it('should allow watching from running', () => {
    expect(VALID_TRANSITIONS['running'].has('watching')).toBe(true);
  });

  it('should allow degraded from any active state', () => {
    expect(VALID_TRANSITIONS['ready'].has('degraded')).toBe(true);
    expect(VALID_TRANSITIONS['planning'].has('degraded')).toBe(true);
    expect(VALID_TRANSITIONS['running'].has('degraded')).toBe(true);
    expect(VALID_TRANSITIONS['watching'].has('degraded')).toBe(true);
  });

  it('should allow failed from any active state', () => {
    expect(VALID_TRANSITIONS['ready'].has('failed')).toBe(true);
    expect(VALID_TRANSITIONS['planning'].has('failed')).toBe(true);
    expect(VALID_TRANSITIONS['running'].has('failed')).toBe(true);
    expect(VALID_TRANSITIONS['watching'].has('failed')).toBe(true);
  });

  it('should allow recovery from degraded via bootstrapping', () => {
    expect(VALID_TRANSITIONS['degraded'].has('bootstrapping')).toBe(true);
    expect(VALID_TRANSITIONS['degraded'].has('ready')).toBe(true);
  });

  it('should allow re-init from failed via bootstrapping', () => {
    expect(VALID_TRANSITIONS['failed'].has('bootstrapping')).toBe(true);
    expect(VALID_TRANSITIONS['failed'].size).toBe(1);
  });
});

describe('canTransition', () => {
  it('should return true for valid transitions', () => {
    expect(canTransition('uninitialized', 'bootstrapping')).toBe(true);
    expect(canTransition('bootstrapping', 'ready')).toBe(true);
    expect(canTransition('ready', 'planning')).toBe(true);
    expect(canTransition('planning', 'running')).toBe(true);
    expect(canTransition('running', 'watching')).toBe(true);
    expect(canTransition('running', 'ready')).toBe(true);
  });

  it('should return false for invalid transitions', () => {
    expect(canTransition('uninitialized', 'ready')).toBe(false);
    expect(canTransition('uninitialized', 'running')).toBe(false);
    expect(canTransition('ready', 'running')).toBe(true);  // direct execution is allowed
    expect(canTransition('watching', 'planning')).toBe(false);
    expect(canTransition('failed', 'ready')).toBe(false);
  });
});

describe('getValidTransitions', () => {
  it('should return array of valid target states', () => {
    const fromUninitialized = getValidTransitions('uninitialized');
    expect(fromUninitialized).toEqual(['bootstrapping']);
  });

  it('should return multiple targets when available', () => {
    const fromReady = getValidTransitions('ready');
    expect(fromReady.length).toBeGreaterThan(1);
    expect(fromReady).toContain('planning');
    expect(fromReady).toContain('degraded');
    expect(fromReady).toContain('failed');
  });
});

describe('TransitionValidator', () => {
  describe('validateTransition', () => {
    it('should validate legal transitions', () => {
      const result = TransitionValidator.validateTransition('uninitialized', 'bootstrapping');
      expect(result.valid).toBe(true);
      expect(result.suggestion).toBeUndefined();
    });

    it('should reject illegal transitions with suggestion', () => {
      const result = TransitionValidator.validateTransition('uninitialized', 'ready');
      expect(result.valid).toBe(false);
      expect(result.suggestion).toContain('bootstrapping');
    });

    it('should reject ready transition with fatal errors', () => {
      const result = TransitionValidator.validateTransition('planning', 'ready', [
        {
          code: 'FATAL_ERROR',
          message: 'Something very bad',
          severity: 'fatal',
          recoverable: false,
        },
      ]);
      expect(result.valid).toBe(false);
      expect(result.suggestion).toContain('fatal');
    });

    it('should allow ready transition with non-fatal errors', () => {
      const result = TransitionValidator.validateTransition('planning', 'ready', [
        {
          code: 'WARN',
          message: 'Minor issue',
          severity: 'warning',
          recoverable: true,
        },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('suggestRecoveryState', () => {
    it('should suggest ready when no errors', () => {
      expect(TransitionValidator.suggestRecoveryState('planning')).toBe('ready');
    });

    it('should return null when already ready and no errors', () => {
      expect(TransitionValidator.suggestRecoveryState('ready')).toBeNull();
    });

    it('should suggest failed for fatal errors', () => {
      const result = TransitionValidator.suggestRecoveryState('running', [
        {
          code: 'FATAL',
          message: 'Fatal error',
          severity: 'fatal',
          recoverable: false,
        },
      ]);
      expect(result).toBe('failed');
    });

    it('should suggest degraded for recoverable errors', () => {
      const result = TransitionValidator.suggestRecoveryState('running', [
        {
          code: 'RECOVERABLE',
          message: 'Can recover',
          severity: 'error',
          recoverable: true,
        },
      ]);
      expect(result).toBe('degraded');
    });

    it('should suggest degraded when degraded is available and error is recoverable', () => {
      const result = TransitionValidator.suggestRecoveryState('bootstrapping', [
        {
          code: 'MINOR',
          message: 'Minor',
          severity: 'warning',
          recoverable: true,
        },
      ]);
      // bootstrapping can now go to degraded for recoverable errors
      expect(result).toBe('degraded');
    });

    it('should return null when no valid recovery exists', () => {
      // From uninitialized, with errors, can't go to degraded or ready
      const result = TransitionValidator.suggestRecoveryState('uninitialized', [
        {
          code: 'ERR',
          message: 'Error',
          severity: 'error',
          recoverable: true,
        },
      ]);
      // uninitialized can only go to bootstrapping, not degraded or ready
      expect(result).toBeNull();
    });
  });
});

describe('Full State Machine Flow', () => {
  it('should support the complete happy path', () => {
    const path: [EngineState, EngineState][] = [
      ['uninitialized', 'bootstrapping'],
      ['bootstrapping', 'ready'],
      ['ready', 'planning'],
      ['planning', 'running'],
      ['running', 'ready'], // complete
    ];

    for (const [from, to] of path) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('should support the watch flow', () => {
    const path: [EngineState, EngineState][] = [
      ['uninitialized', 'bootstrapping'],
      ['bootstrapping', 'ready'],
      ['ready', 'planning'],
      ['planning', 'running'],
      ['running', 'watching'],
      ['watching', 'ready'], // complete
    ];

    for (const [from, to] of path) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('should support degradation and recovery', () => {
    const path: [EngineState, EngineState][] = [
      ['uninitialized', 'bootstrapping'],
      ['bootstrapping', 'ready'],
      ['ready', 'degraded'],
      ['degraded', 'bootstrapping'], // recovery
      ['bootstrapping', 'ready'],
    ];

    for (const [from, to] of path) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('should support failure and re-init', () => {
    const path: [EngineState, EngineState][] = [
      ['uninitialized', 'bootstrapping'],
      ['bootstrapping', 'failed'],
      ['failed', 'bootstrapping'], // re-init
      ['bootstrapping', 'ready'],
    ];

    for (const [from, to] of path) {
      expect(canTransition(from, to)).toBe(true);
    }
  });
});
