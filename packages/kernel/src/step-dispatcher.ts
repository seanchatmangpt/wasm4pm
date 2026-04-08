/**
 * step-dispatcher.ts
 * Bridge between engine's StepDispatcher and kernel's implementAlgorithmStep()
 *
 * Creates a Map<string, StepHandler> that the engine's createStepDispatcher() can use.
 * ML step handlers close over the WASM module and event log handle.
 *
 * The engine uses contracts' PlanStep (id, name, inputs, dependencies, optional).
 * The kernel's implementAlgorithmStep expects planner's PlanStep (id, type, parameters, etc.).
 * This bridge translates between them.
 */

import type { WasmModule } from './handlers.js';
import { implementAlgorithmStep } from './handlers.js';
import { PlanStepType } from '@wasm4pm/planner';

/**
 * Minimal type matching the engine's StepHandler signature.
 * Defined here to avoid importing @wasm4pm/engine (prevents circular dependency).
 */
export interface EngineStep {
  id: string;
  name: string;
  inputs?: Record<string, unknown>;
  dependencies?: string[];
  optional?: boolean;
  description?: string;
  outputs?: string[];
  timeout?: number;
}

export interface EngineStepResult {
  stepId: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    severity: string;
    recoverable: boolean;
    context?: Record<string, unknown>;
  };
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export type EngineStepHandler = (
  step: EngineStep,
  context: Record<string, unknown>
) => Promise<EngineStepResult>;

/** Map of ML algorithm IDs to their PlanStepType */
const ML_ALGORITHM_TO_STEP_TYPE: Record<string, PlanStepType> = {
  ml_classify: PlanStepType.ML_CLASSIFY,
  ml_cluster: PlanStepType.ML_CLUSTER,
  ml_forecast: PlanStepType.ML_FORECAST,
  ml_anomaly: PlanStepType.ML_ANOMALY,
  ml_regress: PlanStepType.ML_REGRESS,
  ml_pca: PlanStepType.ML_PCA,
};

/**
 * Build a handlers map suitable for engine's createStepDispatcher().
 *
 * ML steps are routed to implementAlgorithmStep() using the closed-over
 * wasmModule and eventLogHandle. All other step names fall through to
 * the caller's own handler map.
 *
 * @param wasmModule - Initialized WASM module (with extract_case_features, detect_drift)
 * @param eventLogHandle - Handle returned by wasm.load_eventlog_from_xes()
 * @returns Map<string, EngineStepHandler> keyed by step name
 */
export function buildKernelStepHandlers(
  wasmModule: WasmModule,
  eventLogHandle: string,
  stepImpl?: typeof implementAlgorithmStep
): Map<string, EngineStepHandler> {
  const handlers = new Map<string, EngineStepHandler>();
  const impl = stepImpl ?? implementAlgorithmStep;

  for (const algorithmId of Object.keys(ML_ALGORITHM_TO_STEP_TYPE)) {
    handlers.set(algorithmId, createMlStepHandler(wasmModule, eventLogHandle, algorithmId, impl));
  }

  return handlers;
}

/**
 * Create a StepHandler for a specific ML step type.
 *
 * Translates the engine's PlanStep into the planner's PlanStep format
 * that implementAlgorithmStep() expects.
 */
function createMlStepHandler(
  wasmModule: WasmModule,
  eventLogHandle: string,
  algorithmId: string,
  impl: typeof implementAlgorithmStep
): EngineStepHandler {
  return async (step: EngineStep): Promise<EngineStepResult> => {
    const startTime = Date.now();
    const stepType = ML_ALGORITHM_TO_STEP_TYPE[algorithmId];

    if (!stepType) {
      return {
        stepId: step.id,
        success: false,
        error: {
          code: 'ML_STEP_UNKNOWN',
          message: `Unknown ML algorithm: ${algorithmId}`,
          severity: 'error',
          recoverable: false,
        },
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Translate engine PlanStep → planner PlanStep
      const plannerStep = {
        id: step.id,
        type: stepType,
        description: step.description ?? `ML analysis: ${algorithmId}`,
        required: step.optional !== true,
        parameters: (step.inputs ?? {}) as Record<string, unknown>,
        dependsOn: step.dependencies ?? [],
        parallelizable: false,
      };

      const result = await impl(plannerStep as any, wasmModule, eventLogHandle);

      return {
        stepId: step.id,
        success: true,
        output: {
          algorithm: result.algorithm,
          outputType: result.outputType,
          modelHandle: result.modelHandle,
          executionTimeMs: result.executionTimeMs,
          parameters: result.parameters,
          metadata: result.metadata,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        stepId: step.id,
        success: false,
        error: {
          code: 'ML_STEP_FAILED',
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
          recoverable: true,
          context: { algorithmId },
        },
        durationMs: Date.now() - startTime,
      };
    }
  };
}
