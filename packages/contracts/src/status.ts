/**
 * Status Schema - Lifecycle states for wasm4pm runtime
 * Schema version 1.0
 *
 * Defines all possible states in the runtime lifecycle with
 * deterministic serialization for hashing.
 */

import { z } from 'zod';

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

export const LifecycleStateSchema = z.enum([
  'uninitialized',
  'bootstrapping',
  'ready',
  'planning',
  'running',
  'watching',
  'degraded',
  'failed',
]);

export const StatusSchema = z.object({
  schema_version: z.literal('1.0'),
  state: LifecycleStateSchema,
  timestamp: z.string(),
  last_transition: z.string(),
  previous_state: LifecycleStateSchema.nullable(),
  transition_count: z.number().int().min(0),
  run_id: z.string().nullable(),
  degradation: z.object({
    reason: z.string(),
    affected_subsystems: z.array(z.string()),
    since: z.string(),
  }).optional(),
  failure: z.object({
    error_code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }).optional(),
  uptime_ms: z.number().min(0),
});

/**
 * Status snapshot — captures full runtime state at a point in time
 */
export type Status = z.infer<typeof StatusSchema>;

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
      oneOf: [{ type: 'string' as const, enum: [...LIFECYCLE_STATES] }, { type: 'null' as const }],
    },
    transition_count: { type: 'integer' as const, minimum: 0 },
    run_id: {
      oneOf: [{ type: 'string' as const, format: 'uuid' }, { type: 'null' as const }],
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
