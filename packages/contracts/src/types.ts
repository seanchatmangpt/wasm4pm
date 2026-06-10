/**
 * Shared type definitions for wasm4pm
 */
import { z } from 'zod';

/**
 * Quality metrics for process model assessment.
 * Used by conformance checking and quality commands.
 */
export const QualityMetricsSchema = z.object({
  /** How well the model can replay the observed log (0-1) */
  fitness: z.number(),
  /** How much unobserved behavior the model allows (0-1) */
  precision: z.number(),
  /** How simple/complex the model is (0-1) */
  simplicity: z.number(),
  /** How well the model generalizes to unseen behavior (0-1) */
  generalization: z.number().optional(),
  /** Harmonic mean of fitness and precision (0-1) */
  f_measure: z.number().optional(),
});

export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;

/**
 * Individual step in an execution plan
 */
export const PlanStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  outputs: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  optional: z.boolean().optional(),
  timeout: z.number().optional(),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

/**
 * Execution plan returned by the planner
 * Contains ordered list of steps to execute with dependencies and parameters
 */
export const ExecutionPlanSchema = z.object({
  planId: z.string(),
  steps: z.array(PlanStepSchema),
  totalSteps: z.number(),
  estimatedDurationMs: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  prediction: z
    .object({
      tasks: z.array(z.string()),
      activityKey: z.string(),
      ngramOrder: z.number(),
      driftWindowSize: z.number().optional(),
    })
    .optional(),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

/**
 * Engine state enum
 */
export type EngineState =
  | 'uninitialized'
  | 'bootstrapping'
  | 'ready'
  | 'planning'
  | 'running'
  | 'watching'
  | 'degraded'
  | 'failed';

export const EngineStateSchema = z.enum([
  'uninitialized',
  'bootstrapping',
  'ready',
  'planning',
  'running',
  'watching',
  'degraded',
  'failed',
]);

/**
 * Structured error information
 */
export const EngineErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['info', 'warning', 'error', 'fatal']),
  context: z.record(z.string(), z.unknown()).optional(),
  recoverable: z.boolean(),
  suggestion: z.string().optional(),
});

export type EngineError = z.infer<typeof EngineErrorSchema>;

/**
 * Status update during execution
 */
export const StatusUpdateSchema = z.object({
  timestamp: z.date(),
  state: EngineStateSchema,
  progress: z.number(), // 0-100
  message: z.string().optional(),
  error: EngineErrorSchema.optional(),
});

export type StatusUpdate = z.infer<typeof StatusUpdateSchema>;

/**
 * Complete engine status snapshot
 */
export const EngineStatusSchema = z.object({
  state: EngineStateSchema,
  runId: z.string().optional(),
  progress: z.number(), // 0-100
  estimate: z
    .object({
      elapsed: z.number(),
      remaining: z.number(),
    })
    .optional(),
  errors: z.array(EngineErrorSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type EngineStatus = z.infer<typeof EngineStatusSchema>;

/**
 * Execution receipt containing metadata about a completed run
 */
export const ExecutionReceiptSchema = z.object({
  runId: z.string(),
  planId: z.string(),
  state: EngineStateSchema,
  startedAt: z.date(),
  finishedAt: z.date().optional(),
  durationMs: z.number().optional(),
  progress: z.number(),
  errors: z.array(EngineErrorSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
  predictionResults: z.record(z.string(), z.unknown()).optional(),
});

export type ExecutionReceipt = z.infer<typeof ExecutionReceiptSchema>;
