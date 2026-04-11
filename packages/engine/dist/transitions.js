/**
 * transitions.ts
 * Valid state transitions and transition validation
 * Enforces the engine state machine invariants
 */
/**
 * Map of valid transitions from each state
 *
 * State machine:
 *   uninitialized → bootstrapping → ready → planning → running → (watching | ready)
 *   any active state → degraded | failed
 *   degraded → bootstrapping (recovery) | failed
 *   failed → bootstrapping (re-init)
 */
export const VALID_TRANSITIONS = {
    uninitialized: new Set(['bootstrapping']),
    bootstrapping: new Set(['ready', 'failed', 'degraded']),
    ready: new Set(['planning', 'running', 'watching', 'degraded', 'failed']),
    planning: new Set(['running', 'ready', 'degraded', 'failed']),
    running: new Set(['watching', 'ready', 'degraded', 'failed']),
    watching: new Set(['ready', 'degraded', 'failed']),
    degraded: new Set(['ready', 'bootstrapping', 'failed']),
    failed: new Set(['bootstrapping']),
};
/**
 * Check if a transition from one state to another is valid
 */
export function canTransition(from, to) {
    return VALID_TRANSITIONS[from]?.has(to) ?? false;
}
/**
 * Get all valid target states from a given state
 */
export function getValidTransitions(from) {
    return Array.from(VALID_TRANSITIONS[from] || []);
}
/**
 * Transition validator with recovery context
 * Ensures transitions are valid for the current recovery mode
 */
export class TransitionValidator {
    /**
     * Validates a transition and returns recovery suggestions
     */
    static validateTransition(currentState, targetState, errors) {
        if (!canTransition(currentState, targetState)) {
            return {
                valid: false,
                suggestion: `Cannot transition from ${currentState} to ${targetState}. ` +
                    `Valid next states: ${getValidTransitions(currentState).join(', ')}`,
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
    static suggestRecoveryState(currentState, errors) {
        if (!errors || errors.length === 0) {
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
            if (canTransition(currentState, 'degraded')) {
                return 'degraded';
            }
        }
        if (canTransition(currentState, 'ready')) {
            return 'ready';
        }
        return null;
    }
}
