/**
 * lifecycle.ts
 * State machine and transition rules for engine lifecycle
 * Validates state transitions, enforces invariants, and emits lifecycle events
 */
import { canTransition, getValidTransitions, TransitionValidator, } from './transitions';
// Re-export for backward compatibility
export { TransitionValidator };
/**
 * State machine managing engine lifecycle transitions
 * Enforces valid state transitions and emits events for lifecycle changes
 */
export class StateMachine {
    constructor() {
        this.currentState = 'uninitialized';
        this.listeners = new Set();
        this.transitionHistory = [];
        this.lastTransitionTime = null;
        this.stateEnteredAt = new Date();
    }
    /**
     * Gets the current state
     */
    getState() {
        return this.currentState;
    }
    /**
     * Gets the duration in milliseconds since entering the current state
     */
    getStateAge() {
        return Date.now() - this.stateEnteredAt.getTime();
    }
    /**
     * Gets the time when current state was entered
     */
    getStateEnteredAt() {
        return this.stateEnteredAt;
    }
    /**
     * Gets the last transition time
     */
    getLastTransitionTime() {
        return this.lastTransitionTime;
    }
    /**
     * Gets full transition history
     */
    getTransitionHistory() {
        return [...this.transitionHistory];
    }
    /**
     * Validates if a transition from current state to target state is valid
     */
    canTransition(targetState) {
        return canTransition(this.currentState, targetState);
    }
    /**
     * Gets valid next states from current state
     */
    getValidTransitions() {
        return getValidTransitions(this.currentState);
    }
    /**
     * Attempts to transition to a new state
     * @throws Error if transition is invalid
     */
    transition(targetState, reason) {
        if (!this.canTransition(targetState)) {
            throw new Error(`Invalid state transition: ${this.currentState} -> ${targetState}. ` +
                `Valid transitions from ${this.currentState}: ${this.getValidTransitions().join(', ')}`);
        }
        const fromState = this.currentState;
        const event = {
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
            }
            catch (err) {
                console.error('Error in lifecycle listener:', err);
            }
        });
        return event;
    }
    /**
     * Registers a listener for lifecycle events
     */
    onTransition(listener) {
        this.listeners.add(listener);
        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
        };
    }
    /**
     * Checks if the engine is in a terminal state
     */
    isTerminal() {
        return this.currentState === 'failed';
    }
    /**
     * Checks if the engine is in a ready/operational state
     */
    isOperational() {
        return this.currentState === 'ready' || this.currentState === 'watching';
    }
    /**
     * Checks if the engine is actively processing
     */
    isProcessing() {
        return this.currentState === 'planning' || this.currentState === 'running';
    }
    /**
     * Checks if the engine is in a degraded state but recoverable
     */
    isDegraded() {
        return this.currentState === 'degraded';
    }
}
