/**
 * lifecycle.ts
 * State machine and transition rules for engine lifecycle
 * Validates state transitions, enforces invariants, and emits lifecycle events
 */

import { z } from 'zod';
import { EngineState } from '@wasm4pm/contracts';;
import {
  canTransition,
  getValidTransitions,
  TransitionValidator,
} from './transitions.js';

// Re-export for baseline admissibility
export { TransitionValidator };

export const LifecycleEventSchema = z.object({
  timestamp: z.date(),
  fromState: z.string() as z.ZodType<EngineState>,
  toState: z.string() as z.ZodType<EngineState>,
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Lifecycle event emitted when state transitions occur
 */
export type LifecycleEvent = z.infer<typeof LifecycleEventSchema>;

/**
 * State machine managing engine lifecycle transitions
 * Enforces valid state transitions and emits events for lifecycle changes
 */
/** Maximum number of transition history entries retained (ring-buffer cap). */
const TRANSITION_HISTORY_MAX = 1000;

export class StateMachine {
  private currentState: EngineState = 'uninitialized';
  private listeners: Set<(event: LifecycleEvent) => void> = new Set();
  private transitionHistory: LifecycleEvent[] = [];
  private lastTransitionTime: Date | null = null;
  private stateEnteredAt: Date = new Date();
  private recoveryHistory: number[] = [];
  private recoverySinceStart = 0;

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
   * Gets full transition history (capped at TRANSITION_HISTORY_MAX entries)
   */
  getTransitionHistory(): LifecycleEvent[] {
    return [...this.transitionHistory];
  }

  /**
   * Returns the maximum number of transition history entries retained.
   * When the cap is exceeded the oldest entry is evicted (ring-buffer).
   */
  getTransitionHistoryMaxSize(): number {
    return TRANSITION_HISTORY_MAX;
  }

  /**
   * Validates if a transition from current state to target state is valid
   */
  canTransition(targetState: EngineState): boolean {
    return canTransition(this.currentState, targetState);
  }

  /**
   * Gets valid next states from current state
   */
  getValidTransitions(): EngineState[] {
    return getValidTransitions(this.currentState);
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

    // Cap history to prevent unbounded growth in long-running engines
    if (this.transitionHistory.length > TRANSITION_HISTORY_MAX) {
      this.transitionHistory.shift();
    }

    // Emit event to all listeners — listener errors must not be hidden
    const listenerErrors: Error[] = [];
    this.listeners.forEach((listener) => {
      try {
        listener(event);
        // Note: We don't check return value — listeners may be arrow functions
        // that implicitly return from expressions like array.push().
        // If a listener needs to report an error, it should throw.
      } catch (err) {
        listenerErrors.push(err instanceof Error ? err : new Error(String(err)));
      }
    });

    // Propagate listener errors to prevent silent state machine corruption
    if (listenerErrors.length > 0) {
      const aggregated = new Error(
        `${listenerErrors.length} lifecycle listener error(s): ${listenerErrors.map((e) => e.message).join('; ')}`
      );
      throw aggregated;
    }

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

  /**
   * Record a recovery operation duration for MTTR tracking
   * @param durationMs - Recovery duration in milliseconds
   */
  recordRecovery(durationMs: number): void {
    this.recoveryHistory.push(durationMs);
    this.recoverySinceStart++;

    // Keep only last 100 recovery times to prevent unbounded growth
    if (this.recoveryHistory.length > 100) {
      this.recoveryHistory.shift();
    }
  }

  /**
   * Get Mean Time To Recovery (MTTR) in milliseconds
   * Returns the average of all recorded recovery durations
   * @returns MTTR in milliseconds, or 0 if no recoveries recorded
   */
  getMTTR(): number {
    if (this.recoveryHistory.length === 0) return 0;
    const sum = this.recoveryHistory.reduce((a, b) => a + b, 0);
    return sum / this.recoveryHistory.length;
  }

  /**
   * Get number of recoveries since engine start
   * @returns Recovery count
   */
  getRecoveryCount(): number {
    return this.recoverySinceStart;
  }
}
