/**
 * Explain Snapshot Schema
 * Schema version 1.0
 *
 * An explain snapshot captures the complete execution result for
 * introspection/debugging. It mirrors the execution result structure
 * exactly, adding provenance and timing information.
 */

import type { Receipt } from './receipt.js';
import type { Plan } from './plan.js';
import type { Status } from './status.js';

/**
 * Timing breakdown for each phase of execution
 */
export interface PhaseTiming {
  /** Phase name */
  phase: string;

  /** ISO 8601 start time */
  start: string;

  /** ISO 8601 end time */
  end: string;

  /** Duration in milliseconds */
  duration_ms: number;
}

/**
 * Resource usage during execution
 */
export interface ResourceUsage {
  /** Peak WASM memory in bytes */
  peak_memory_bytes: number;

  /** Total events processed */
  events_processed: number;

  /** Number of algorithm invocations */
  algorithm_invocations: number;
}

/**
 * Execution profile — detailed performance breakdown
 */
export interface ExecutionProfile {
  /** Per-phase timing breakdown */
  phases: PhaseTiming[];

  /** Resource usage summary */
  resources: ResourceUsage;

  /** Total wall-clock time in ms */
  total_duration_ms: number;
}

/**
 * Explain snapshot — identical structure to execution result,
 * capturing everything needed to reproduce or debug a run
 */
export interface ExplainSnapshot {
  /** Schema version for forward compatibility */
  schema_version: '1.0';

  /** The receipt from this execution */
  receipt: Receipt;

  /** The plan that was executed */
  plan: Plan;

  /** Runtime status at completion */
  status: Status;

  /** Detailed execution profile */
  execution_profile: ExecutionProfile;

  /** BLAKE3 hash of the output artifacts */
  output_hash: string;

  /** ISO 8601 timestamp of snapshot creation */
  captured_at: string;

  /** Environment info for reproducibility */
  environment: {
    /** Node.js / browser / WASI */
    platform: string;
    /** Runtime version */
    runtime_version: string;
    /** wasm4pm package version */
    package_version: string;
  };
}

/**
 * Type guard for ExplainSnapshot objects
 */
export function isExplainSnapshot(value: unknown): value is ExplainSnapshot {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    e.schema_version === '1.0' &&
    typeof e.receipt === 'object' &&
    e.receipt !== null &&
    typeof e.plan === 'object' &&
    e.plan !== null &&
    typeof e.status === 'object' &&
    e.status !== null &&
    typeof e.execution_profile === 'object' &&
    e.execution_profile !== null &&
    typeof e.output_hash === 'string' &&
    typeof e.captured_at === 'string' &&
    typeof e.environment === 'object' &&
    e.environment !== null
  );
}

/**
 * JSON Schema for ExplainSnapshot (for external validation)
 */
export const EXPLAIN_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://wasm4pm.dev/schemas/explain/1.0',
  title: 'ExplainSnapshot',
  description: 'Complete execution snapshot for debugging and reproducibility',
  type: 'object' as const,
  required: [
    'schema_version',
    'receipt',
    'plan',
    'status',
    'execution_profile',
    'output_hash',
    'captured_at',
    'environment',
  ],
  properties: {
    schema_version: { type: 'string' as const, const: '1.0' },
    receipt: { $ref: 'https://wasm4pm.dev/schemas/receipt/1.0' },
    plan: { $ref: 'https://wasm4pm.dev/schemas/plan/1.0' },
    status: { $ref: 'https://wasm4pm.dev/schemas/status/1.0' },
    execution_profile: {
      type: 'object' as const,
      required: ['phases', 'resources', 'total_duration_ms'],
      properties: {
        phases: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            required: ['phase', 'start', 'end', 'duration_ms'],
            properties: {
              phase: { type: 'string' as const },
              start: { type: 'string' as const, format: 'date-time' },
              end: { type: 'string' as const, format: 'date-time' },
              duration_ms: { type: 'number' as const, minimum: 0 },
            },
            additionalProperties: false,
          },
        },
        resources: {
          type: 'object' as const,
          required: ['peak_memory_bytes', 'events_processed', 'algorithm_invocations'],
          properties: {
            peak_memory_bytes: { type: 'integer' as const, minimum: 0 },
            events_processed: { type: 'integer' as const, minimum: 0 },
            algorithm_invocations: { type: 'integer' as const, minimum: 0 },
          },
          additionalProperties: false,
        },
        total_duration_ms: { type: 'number' as const, minimum: 0 },
      },
      additionalProperties: false,
    },
    output_hash: { type: 'string' as const, pattern: '^[0-9a-f]{64}$' },
    captured_at: { type: 'string' as const, format: 'date-time' },
    environment: {
      type: 'object' as const,
      required: ['platform', 'runtime_version', 'package_version'],
      properties: {
        platform: { type: 'string' as const },
        runtime_version: { type: 'string' as const },
        package_version: { type: 'string' as const },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;
