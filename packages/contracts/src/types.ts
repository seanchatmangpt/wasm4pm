/**
 * Shared type definitions for wasm4pm
 */

/**
 * Quality metrics for process model assessment.
 * Used by conformance checking and quality commands.
 */
export interface QualityMetrics {
  /** How well the model can replay the observed log (0-1) */
  fitness: number;
  /** How much unobserved behavior the model allows (0-1) */
  precision: number;
  /** How simple/complex the model is (0-1) */
  simplicity: number;
  /** How well the model generalizes to unseen behavior (0-1) */
  generalization?: number;
  /** Harmonic mean of fitness and precision (0-1) */
  f_measure?: number;
}

/**
 * Execution plan returned by the planner
 * Contains ordered list of steps to execute with dependencies and parameters
 */
export interface ExecutionPlan {
  planId: string;
  steps: PlanStep[];
  totalSteps: number;
  estimatedDurationMs?: number;
  metadata?: Record<string, unknown>;
  prediction?: {
    tasks: string[];        // ['next_activity', 'drift', 'outcome', ...]
    activityKey: string;
    ngramOrder: number;
    driftWindowSize?: number;
  };
}

/**
 * Individual step in an execution plan
 */
export interface PlanStep {
  id: string;
  name: string;
  description?: string;
  inputs?: Record<string, unknown>;
  outputs?: string[];
  dependencies?: string[];
  optional?: boolean;
  timeout?: number;
}

/**
 * Status update during execution
 */
export interface StatusUpdate {
  timestamp: Date;
  state: EngineState;
  progress: number; // 0-100
  message?: string;
  error?: EngineError;
}

/**
 * Structured error information
 */
export interface EngineError {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  context?: Record<string, unknown>;
  recoverable: boolean;
  suggestion?: string;
}

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

/**
 * Complete engine status snapshot
 */
export interface EngineStatus {
  state: EngineState;
  runId?: string;
  progress: number; // 0-100
  estimate?: {
    elapsed: number;
    remaining: number;
  };
  errors: EngineError[];
  metadata?: Record<string, unknown>;
}

/**
 * Execution receipt containing metadata about a completed run
 */
export interface ExecutionReceipt {
  runId: string;
  planId: string;
  state: EngineState;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  progress: number;
  errors: EngineError[];
  metadata?: Record<string, unknown>;
  predictionResults?: Record<string, unknown>;
}
