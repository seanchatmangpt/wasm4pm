/**
 * lifecycle.ts
 * State machine and transition rules for engine lifecycle
 * Validates state transitions, enforces invariants, and emits lifecycle events
 */

import { EngineState, ErrorInfo } from '@wasm4pm/types';

/**
 * Lifecycle event emitted when state transitions occur
 */
export interface LifecycleEvent {
  timestamp: Date;
  fromState: EngineState;
  toState: EngineState;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Defines valid transitions from each state
 */
const VALID_TRANSITIONS: Record<EngineState, Set<EngineState>> = {
  uninitialized: new Set(['bootstrapping']),
  bootstrapping: new Set(['ready', 'failed']),
  ready: new Set(['planning', 'degraded', 'failed']),
  planning: new Set(['running', 'ready', 'degraded', 'failed']),
  running: new Set(['watching', 'ready', 'degraded', 'failed']),
  watching: new Set(['ready', 'degraded', 'failed']),
  degraded: new Set(['ready', 'bootstrapping', 'failed']),
  failed: new Set(['bootstrapping']),
};

/**
 * State machine managing engine lifecycle transitions
 * Enforces valid state transitions and emits events for lifecycle changes
 */
export class StateMachine {
  private currentState: EngineState = 'uninitialized';
  private listeners: Set<(event: LifecycleEvent) => void> = new Set();
  private transitionHistory: LifecycleEvent[] = [];
  private lastTransitionTime: Date | null = null;
  private stateEnteredAt: Date = new Date();

  /**
   * Gets the current state
   */
  getState(): EngineState {
    return this.currentState;
  }

  /**
   * Gets the duration in milliseconds since entering the current state
   */
  getStateAge(): number {
    return Date.now() - this.stateEnteredAt.getTime();
  }

  /**
   * Gets the time when current state was entered
   */
  getStateEnteredAt(): Date {
    return this.stateEnteredAt;
  }

  /**
   * Gets the last transition time
   */
  getLastTransitionTime(): Date | null {
    return this.lastTransitionTime;
  }

  /**
   * Gets full transition history
   */
  getTransitionHistory(): LifecycleEvent[] {
    return [...this.transitionHistory];
  }

  /**
   * Validates if a transition from current state to target state is valid
   */
  canTransition(targetState: EngineState): boolean {
    return VALID_TRANSITIONS[this.currentState]?.has(targetState) ?? false;
  }

  /**
   * Gets valid next states from current state
   */
  getValidTransitions(): EngineState[] {
    return Array.from(VALID_TRANSITIONS[this.currentState] || []);
  }

  /**
   * Attempts to transition to a new state
   * @throws Error if transition is invalid
   */
  transition(targetState: EngineState, reason?: string): LifecycleEvent {
    if (!this.canTransition(targetState)) {
      throw new Error(
        `Invalid state transition: ${this.currentState} -> ${targetState}. ` +
        `Valid transitions from ${this.currentState}: ${this.getValidTransitions().join(', ')}`
      );
    }

    const fromState = this.currentState;
    const event: LifecycleEvent = {
      timestamp: new Date(),
      fromState,
      toState: targetState,
      reason,
    };

    this.currentState = targetState;
    this.stateEnteredAt = event.timestamp;
    this.lastTransitionTime = event.timestamp;
    this.transitionHistory.push(event);

    // Emit event to all listeners
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in lifecycle listener:', err);
      }
    });

    return event;
  }

  /**
   * Registers a listener for lifecycle events
   */
  onTransition(listener: (event: LifecycleEvent) => void): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Checks if the engine is in a terminal state
   */
  isTerminal(): boolean {
    return this.currentState === 'failed';
  }

  /**
   * Checks if the engine is in a ready/operational state
   */
  isOperational(): boolean {
    return this.currentState === 'ready' || this.currentState === 'watching';
  }

  /**
   * Checks if the engine is actively processing
   */
  isProcessing(): boolean {
    return this.currentState === 'planning' || this.currentState === 'running';
  }

  /**
   * Checks if the engine is in a degraded state but recoverable
   */
  isDegraded(): boolean {
    return this.currentState === 'degraded';
  }
}

/**
 * Transition validator with recovery context
 * Ensures transitions are valid for the current recovery mode
 */
export class TransitionValidator {
  /**
   * Validates a transition and returns recovery suggestions
   */
  static validateTransition(
    currentState: EngineState,
    targetState: EngineState,
    errors?: ErrorInfo[]
  ): { valid: boolean; suggestion?: string } {
    if (!VALID_TRANSITIONS[currentState]?.has(targetState)) {
      return {
        valid: false,
        suggestion: `Cannot transition from ${currentState} to ${targetState}. ` +
          `Valid next states: ${Array.from(VALID_TRANSITIONS[currentState] || []).join(', ')}`,
      };
    }

    // Additional validation for error states
    if (targetState === 'ready' && errors && errors.length > 0) {
      const hasFatalErrors = errors.some((e) => e.severity === 'fatal');
      if (hasFatalErrors) {
        return {
          valid: false,
          suggestion: 'Cannot transition to ready state with fatal errors. Consider failed or degraded state.',
        };
      }
    }

    return { valid: true };
  }

  /**
   * Suggests the best target state based on current state and error condition
   */
  static suggestRecoveryState(
    currentState: EngineState,
    errors?: ErrorInfo[]
  ): EngineState | null {
    if (!errors || errors.length === 0) {
      // No errors, try to return to ready
      if (currentState !== 'ready') {
        return 'ready';
      }
      return null;
    }

    const hasFatalErrors = errors.some((e) => e.severity === 'fatal');
    const hasRecoverableErrors = errors.some((e) => e.recoverable);

    if (hasFatalErrors) {
      return 'failed';
    }

    if (hasRecoverableErrors) {
      if (VALID_TRANSITIONS[currentState]?.has('degraded')) {
        return 'degraded';
      }
    }

    // Try to go to ready if possible
    if (VALID_TRANSITIONS[currentState]?.has('ready')) {
      return 'ready';
    }

    return null;
  }
}
