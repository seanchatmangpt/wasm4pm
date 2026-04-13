/**
 * Status Schema - Lifecycle states for wasm4pm runtime
 * Schema version 1.0
 *
 * Defines all possible states in the runtime lifecycle with
 * deterministic serialization for hashing.
 */

/**
 * All valid lifecycle states
 */
export type LifecycleState =
  | 'uninitialized'
  | 'bootstrapping'
  | 'ready'
  | 'planning'
  | 'running'
  | 'watching'
  | 'degraded'
  | 'failed';

/**
 * Ordered lifecycle states for deterministic comparison
 */
export const LIFECYCLE_STATES: readonly LifecycleState[] = [
  'uninitialized',
  'bootstrapping',
  'ready',
  'planning',
  'running',
  'watching',
  'degraded',
  'failed',
] as const;

/**
 * Allowed state transitions (from → to[])
 */
export const STATE_TRANSITIONS: Record<LifecycleState, readonly LifecycleState[]> = {
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
 * Status snapshot — captures full runtime state at a point in time
 */
export interface Status {
  /** Schema version for forward compatibility */
  schema_version: '1.0';

  /** Current lifecycle state */
  state: LifecycleState;

  /** ISO 8601 timestamp of this snapshot */
  timestamp: string;

  /** ISO 8601 timestamp of last state transition */
  last_transition: string;

  /** Previous state before the current one */
  previous_state: LifecycleState | null;

  /** Number of state transitions since initialization */
  transition_count: number;

  /** Active run ID (if state is running/watching/degraded) */
  run_id: string | null;

  /** Degradation details (if state is degraded) */
  degradation?: {
    reason: string;
    affected_subsystems: string[];
    since: string;
  };

  /** Failure details (if state is failed) */
  failure?: {
    error_code: string;
    message: string;
    recoverable: boolean;
  };

  /** Uptime in milliseconds since initialization */
  uptime_ms: number;
}

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  return STATE_TRANSITIONS[from].includes(to);
}

/**
 * Check if a string is a valid lifecycle state
 */
export function isLifecycleState(value: string): value is LifecycleState {
  return LIFECYCLE_STATES.includes(value as LifecycleState);
}

/**
 * Type guard for Status objects
 */
export function isStatus(value: unknown): value is Status {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    s.schema_version === '1.0' &&
    typeof s.state === 'string' &&
    isLifecycleState(s.state) &&
    typeof s.timestamp === 'string' &&
    typeof s.last_transition === 'string' &&
    typeof s.transition_count === 'number' &&
    typeof s.uptime_ms === 'number'
  );
}

/**
 * JSON Schema for Status (for external validation)
 */
export const STATUS_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://wasm4pm.dev/schemas/status/1.0',
  title: 'Status',
  description: 'Runtime lifecycle status snapshot',
  type: 'object' as const,
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
    schema_version: { type: 'string' as const, const: '1.0' },
    state: {
      type: 'string' as const,
      enum: [...LIFECYCLE_STATES],
    },
    timestamp: { type: 'string' as const, format: 'date-time' },
    last_transition: { type: 'string' as const, format: 'date-time' },
    previous_state: {
      oneOf: [
        { type: 'string' as const, enum: [...LIFECYCLE_STATES] },
        { type: 'null' as const },
      ],
    },
    transition_count: { type: 'integer' as const, minimum: 0 },
    run_id: {
      oneOf: [
        { type: 'string' as const, format: 'uuid' },
        { type: 'null' as const },
      ],
    },
    degradation: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string' as const },
        affected_subsystems: { type: 'array' as const, items: { type: 'string' as const } },
        since: { type: 'string' as const, format: 'date-time' },
      },
      required: ['reason', 'affected_subsystems', 'since'],
    },
    failure: {
      type: 'object' as const,
      properties: {
        error_code: { type: 'string' as const },
        message: { type: 'string' as const },
        recoverable: { type: 'boolean' as const },
      },
      required: ['error_code', 'message', 'recoverable'],
    },
    uptime_ms: { type: 'number' as const, minimum: 0 },
  },
  additionalProperties: false,
} as const;
