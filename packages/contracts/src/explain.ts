/**
 * Explain Snapshot Schema
 * Schema version 1.0
 *
 * An explain snapshot captures the complete execution result for
 * introspection/debugging. It mirrors the execution result structure
 * exactly, adding provenance and timing information.
 */

import { z } from 'zod';
import { ReceiptSchema } from './receipt.js';
import type { Receipt } from './receipt.js';
import type { Plan } from './plan.js';
import { StatusSchema } from './status.js';
import type { Status } from './status.js';

export const PhaseTimingSchema = z.object({
  phase: z.string(),
  start: z.string(),
  end: z.string(),
  duration_ms: z.number().min(0),
});

/**
 * Timing breakdown for each phase of execution
 */
export type PhaseTiming = z.infer<typeof PhaseTimingSchema>;

export const ResourceUsageSchema = z.object({
  peak_memory_bytes: z.number().int().min(0),
  events_processed: z.number().int().min(0),
  algorithm_invocations: z.number().int().min(0),
});

/**
 * Resource usage during execution
 */
export type ResourceUsage = z.infer<typeof ResourceUsageSchema>;

export const ExplainExecutionProfileSchema = z.object({
  phases: z.array(PhaseTimingSchema),
  resources: ResourceUsageSchema,
  total_duration_ms: z.number().min(0),
});

/**
 * Execution profile — detailed performance breakdown
 */
export type ExecutionProfile = z.infer<typeof ExplainExecutionProfileSchema>;

export const ExplainSnapshotSchema = z.object({
  schema_version: z.literal('1.0'),
  receipt: ReceiptSchema,
  plan: z.record(z.string(), z.unknown()),
  status: StatusSchema,
  execution_profile: ExplainExecutionProfileSchema,
  output_hash: z.string(),
  captured_at: z.string(),
  environment: z.object({
    platform: z.string(),
    runtime_version: z.string(),
    package_version: z.string(),
  }),
});

/**
 * Explain snapshot — identical structure to execution result,
 * capturing everything needed to reproduce or debug a run
 */
export type ExplainSnapshot = z.infer<typeof ExplainSnapshotSchema> & {
  plan: Plan;
};

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
