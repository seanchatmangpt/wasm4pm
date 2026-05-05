/**
 * execution.ts
 * Plan execution engine with topological sort and step dispatch
 * Handles step execution, dependency tracking, and progress updates
 */
import { ExecutionPlan, ExecutionReceipt, EngineError, StatusUpdate, PlanStep } from '@wasm4pm/contracts';
/**
 * Step handler function type
 * Called to execute a specific step
 */
export type StepHandler = (step: PlanStep, context: ExecutionContext) => Promise<StepResult>;
/**
 * Result from a step execution
 */
export interface StepResult {
    stepId: string;
    success: boolean;
    output?: Record<string, unknown>;
    error?: EngineError;
    durationMs?: number;
    metadata?: Record<string, unknown>;
}
/**
 * Context passed to step handlers
 */
export interface ExecutionContext {
    planId: string;
    runId: string;
    stepIndex: number;
    totalSteps: number;
    previousResults: Map<string, StepResult>;
    onProgress?: (progress: number, message: string) => void;
}
/**
 * Step handler dispatcher
 */
export interface StepDispatcher {
    dispatch(step: PlanStep, context: ExecutionContext): Promise<StepResult>;
}
/**
 * Validates plan structure before execution
 * Checks for:
 * - All steps have IDs
 * - All dependencies are satisfied
 * - No circular dependencies
 * - Topological sort is possible
 *
 * @param plan - The execution plan to validate
 * @returns Array of validation errors (empty if valid)
 */
export declare function validatePlan(plan: ExecutionPlan): string[];
/**
 * Topologically sorts steps in execution order
 * Uses Kahn's algorithm to compute the order
 *
 * @param plan - The execution plan
 * @returns Array of step IDs in execution order
 * @throws Error if the plan contains cycles
 */
export declare function topologicalSortPlan(plan: ExecutionPlan): string[];
/**
 * Executes a plan step by step
 * Respects dependencies and updates progress
 *
 * @param plan - The execution plan
 * @param dispatcher - Step handler dispatcher
 * @param runId - Unique run identifier
 * @param onProgress - Progress callback
 * @returns ExecutionReceipt with results
 */
export declare function executePlan(plan: ExecutionPlan, dispatcher: StepDispatcher, runId: string, onProgress?: (update: Partial<StatusUpdate>) => void): Promise<ExecutionReceipt>;
/**
 * Creates a step dispatcher that routes steps to handlers
 * Provides a default no-op handler for unknown step types
 */
export declare function createStepDispatcher(handlers: Map<string, StepHandler>): StepDispatcher;
//# sourceMappingURL=execution.d.ts.map