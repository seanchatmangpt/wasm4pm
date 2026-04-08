/**
 * transitions.ts
 * Valid state transitions and transition validation
 * Enforces the engine state machine invariants
 */
import { EngineState, EngineError } from '@wasm4pm/contracts';
/**
 * Map of valid transitions from each state
 *
 * State machine:
 *   uninitialized → bootstrapping → ready → planning → running → (watching | ready)
 *   any active state → degraded | failed
 *   degraded → bootstrapping (recovery) | failed
 *   failed → bootstrapping (re-init)
 */
export declare const VALID_TRANSITIONS: Record<EngineState, Set<EngineState>>;
/**
 * Check if a transition from one state to another is valid
 */
export declare function canTransition(from: EngineState, to: EngineState): boolean;
/**
 * Get all valid target states from a given state
 */
export declare function getValidTransitions(from: EngineState): EngineState[];
/**
 * Transition validator with recovery context
 * Ensures transitions are valid for the current recovery mode
 */
export declare class TransitionValidator {
    /**
     * Validates a transition and returns recovery suggestions
     */
    static validateTransition(currentState: EngineState, targetState: EngineState, errors?: EngineError[]): {
        valid: boolean;
        suggestion?: string;
    };
    /**
     * Suggests the best target state based on current state and error condition
     */
    static suggestRecoveryState(currentState: EngineState, errors?: EngineError[]): EngineState | null;
}
//# sourceMappingURL=transitions.d.ts.map