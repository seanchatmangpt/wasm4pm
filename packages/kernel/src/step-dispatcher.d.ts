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
export declare function buildKernelStepHandlers(
  wasmModule: WasmModule,
  eventLogHandle: string,
  stepImpl?: typeof implementAlgorithmStep
): Map<string, EngineStepHandler>;
//# sourceMappingURL=step-dispatcher.d.ts.map
