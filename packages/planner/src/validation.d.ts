/**
 * Plan validation utilities
 */
import type { ExecutionPlan } from './planner';
/**
 * Validation error
 */
export interface ValidationError {
    /** Field or aspect that failed validation */
    path: string;
    /** Error message */
    message: string;
    /** Suggested fix if available */
    suggestion?: string;
    /** Severity level */
    severity: 'error' | 'warning' | 'info';
}
/**
 * Validates an execution plan for structural correctness and consistency
 *
 * Checks:
 * - All step IDs are unique
 * - All step dependencies reference existing steps
 * - Graph is acyclic (no circular dependencies)
 * - DAG contains expected nodes and edges
 * - Bootstrap and cleanup steps are present
 * - Step types are valid
 * - Required steps are not optional
 * - Memory and time estimates are positive
 *
 * @param executionPlan - Plan to validate
 * @returns Array of validation errors (empty if valid)
 */
export declare function validatePlan(executionPlan: ExecutionPlan): ValidationError[];
/**
 * Asserts that a plan is valid, throwing an error if not
 *
 * @param executionPlan - Plan to validate
 * @throws Error if plan is invalid
 */
export declare function assertPlanValid(executionPlan: ExecutionPlan): void;
/**
 * Validates source/sink compatibility for a plan.
 * Checks that the source format is valid for the algorithms selected
 * and that the sink can accept the algorithm output.
 *
 * @param sourceKind - Source format (e.g., 'xes', 'csv')
 * @param sinkKind - Sink format (e.g., 'json', 'parquet')
 * @returns Array of validation errors (empty if compatible)
 */
export declare function validateSourceSinkCompatibility(sourceKind: string, sinkKind: string): ValidationError[];
//# sourceMappingURL=validation.d.ts.map