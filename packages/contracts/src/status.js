/**
 * Status Schema - Lifecycle states for wasm4pm runtime
 * Schema version 1.0
 *
 * Defines all possible states in the runtime lifecycle with
 * deterministic serialization for hashing.
 */
/**
 * Ordered lifecycle states for deterministic comparison
 */
export const LIFECYCLE_STATES = [
    'uninitialized',
    'bootstrapping',
    'ready',
    'planning',
    'running',
    'watching',
    'degraded',
    'failed',
];
/**
 * Allowed state transitions (from → to[])
 */
export const STATE_TRANSITIONS = {
    uninitialized: ['bootstrapping'],
    bootstrapping: ['ready', 'failed'],
    ready: ['planning', 'watching', 'failed'],
    planning: ['running', 'failed'],
    running: ['ready', 'degraded', 'failed'],
    watching: ['running', 'degraded', 'failed'],
    degraded: ['ready', 'failed'],
    failed: ['uninitialized'],
};
/**
 * Check if a state transition is valid
 */
export function isValidTransition(from, to) {
    return STATE_TRANSITIONS[from].includes(to);
}
/**
 * Check if a string is a valid lifecycle state
 */
export function isLifecycleState(value) {
    return LIFECYCLE_STATES.includes(value);
}
/**
 * Type guard for Status objects
 */
export function isStatus(value) {
    if (!value || typeof value !== 'object')
        return false;
    const s = value;
    return (s.schema_version === '1.0' &&
        typeof s.state === 'string' &&
        isLifecycleState(s.state) &&
        typeof s.timestamp === 'string' &&
        typeof s.last_transition === 'string' &&
        typeof s.transition_count === 'number' &&
        typeof s.uptime_ms === 'number');
}
/**
 * JSON Schema for Status (for external validation)
 */
export const STATUS_JSON_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://wasm4pm.dev/schemas/status/1.0',
    title: 'Status',
    description: 'Runtime lifecycle status snapshot',
    type: 'object',
    required: [
        'schema_version',
        'state',
        'timestamp',
        'last_transition',
        'previous_state',
        'transition_count',
        'run_id',
        'uptime_ms',
    ],
    properties: {
        schema_version: { type: 'string', const: '1.0' },
        state: {
            type: 'string',
            enum: [...LIFECYCLE_STATES],
        },
        timestamp: { type: 'string', format: 'date-time' },
        last_transition: { type: 'string', format: 'date-time' },
        previous_state: {
            oneOf: [
                { type: 'string', enum: [...LIFECYCLE_STATES] },
                { type: 'null' },
            ],
        },
        transition_count: { type: 'integer', minimum: 0 },
        run_id: {
            oneOf: [
                { type: 'string', format: 'uuid' },
                { type: 'null' },
            ],
        },
        degradation: {
            type: 'object',
            properties: {
                reason: { type: 'string' },
                affected_subsystems: { type: 'array', items: { type: 'string' } },
                since: { type: 'string', format: 'date-time' },
            },
            required: ['reason', 'affected_subsystems', 'since'],
        },
        failure: {
            type: 'object',
            properties: {
                error_code: { type: 'string' },
                message: { type: 'string' },
                recoverable: { type: 'boolean' },
            },
            required: ['error_code', 'message', 'recoverable'],
        },
        uptime_ms: { type: 'number', minimum: 0 },
    },
    additionalProperties: false,
};
//# sourceMappingURL=status.js.map