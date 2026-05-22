/**
 * validation.ts
 * Structural validation gate for KernelResult outputs.
 *
 * Validates that algorithm results meet minimum structural requirements
 * before returning to callers. Maps to Chicago TDD doctrine: invalid
 * models must not silently propagate downstream.
 */
import type { KernelResult } from './api.js';
import type { AlgorithmMetadata } from './registry.js';
export interface ViolationReport {
    rule: string;
    severity: 'warning' | 'error';
    message: string;
    path?: string;
    context?: Record<string, unknown>;
}
/**
 * Thrown when a kernel result fails structural validation.
 * Corresponds to exit code 3 (execution_error) in the CLI.
 */
export declare class ValidationError extends Error {
    readonly violations: ViolationReport[];
    readonly algorithmName: string;
    constructor(message: string, algorithmName: string, violations: ViolationReport[]);
}
/**
 * Validate a KernelResult against the expected output contract.
 * Throws ValidationError if hard constraints are violated.
 * Returns silently on warnings-only or valid results.
 */
export declare function validateKernelResult(result: KernelResult, metadata: AlgorithmMetadata): void;
//# sourceMappingURL=validation.d.ts.map