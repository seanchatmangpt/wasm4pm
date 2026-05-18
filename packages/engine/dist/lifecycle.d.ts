/**
 * lifecycle.ts
 * State machine and transition rules for engine lifecycle
 * Validates state transitions, enforces invariants, and emits lifecycle events
 */
import { EngineState } from '@wasm4pm/contracts';
import { TransitionValidator } from './transitions.js';
export { TransitionValidator };
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
export declare class StateMachine {
    private currentState;
    private listeners;
    private transitionHistory;
    private lastTransitionTime;
    private stateEnteredAt;
    private recoveryHistory;
    private recoverySinceStart;
    /**
     * Gets the current state
     */
    getState(): EngineState;
    /**
     * Gets the duration in milliseconds since entering the current state
     */
    getStateAge(): number;
    /**
     * Gets the time when current state was entered
     */
    getStateEnteredAt(): Date;
    /**
     * Gets the last transition time
     */
    getLastTransitionTime(): Date | null;
    /**
     * Gets full transition history (capped at TRANSITION_HISTORY_MAX entries)
     */
    getTransitionHistory(): LifecycleEvent[];
    /**
     * Returns the maximum number of transition history entries retained.
     * When the cap is exceeded the oldest entry is evicted (ring-buffer).
     */
    getTransitionHistoryMaxSize(): number;
    /**
     * Validates if a transition from current state to target state is valid
     */
    canTransition(targetState: EngineState): boolean;
    /**
     * Gets valid next states from current state
     */
    getValidTransitions(): EngineState[];
    /**
     * Attempts to transition to a new state
     * @throws Error if transition is invalid
     */
    transition(targetState: EngineState, reason?: string): LifecycleEvent;
    /**
     * Registers a listener for lifecycle events
     */
    onTransition(listener: (event: LifecycleEvent) => void): () => void;
    /**
     * Checks if the engine is in a terminal state
     */
    isTerminal(): boolean;
    /**
     * Checks if the engine is in a ready/operational state
     */
    isOperational(): boolean;
    /**
     * Checks if the engine is actively processing
     */
    isProcessing(): boolean;
    /**
     * Checks if the engine is in a degraded state but recoverable
     */
    isDegraded(): boolean;
    /**
     * Record a recovery operation duration for MTTR tracking
     * @param durationMs - Recovery duration in milliseconds
     */
    recordRecovery(durationMs: number): void;
    /**
     * Get Mean Time To Recovery (MTTR) in milliseconds
     * Returns the average of all recorded recovery durations
     * @returns MTTR in milliseconds, or 0 if no recoveries recorded
     */
    getMTTR(): number;
    /**
     * Get number of recoveries since engine start
     * @returns Recovery count
     */
    getRecoveryCount(): number;
}
//# sourceMappingURL=lifecycle.d.ts.map