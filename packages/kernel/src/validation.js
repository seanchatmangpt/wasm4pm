/**
 * validation.ts
 * Structural validation gate for KernelResult outputs.
 *
 * Validates that algorithm results meet minimum structural requirements
 * before returning to callers. Maps to Chicago TDD doctrine: invalid
 * models must not silently propagate downstream.
 */
/**
 * Thrown when a kernel result fails structural validation.
 * Corresponds to exit code 3 (execution_error) in the CLI.
 */
export class ValidationError extends Error {
    constructor(message, algorithmName, violations) {
        super(message);
        this.name = 'ValidationError';
        this.algorithmName = algorithmName;
        this.violations = violations;
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}
/**
 * Validate a KernelResult against the expected output contract.
 * Throws ValidationError if hard constraints are violated.
 * Returns silently on warnings-only or valid results.
 */
export function validateKernelResult(result, metadata) {
    const violations = [];
    // Hard constraint: handle must be a non-empty string
    if (!result.handle || typeof result.handle !== 'string' || result.handle.trim() === '') {
        violations.push({
            rule: 'handle-present',
            severity: 'error',
            message: 'Algorithm produced no output handle (WASM returned empty result)',
            path: 'handle',
            context: { algorithm: result.algorithm, actual: result.handle },
        });
    }
    // Hard constraint: outputType must match registry expectation
    if (result.outputType !== metadata.outputType) {
        violations.push({
            rule: 'output-type-match',
            severity: 'error',
            message: `Output type mismatch: expected "${metadata.outputType}", got "${result.outputType}"`,
            path: 'outputType',
            context: {
                algorithm: result.algorithm,
                expected: metadata.outputType,
                actual: result.outputType,
            },
        });
    }
    // Soft constraint: duration should be non-negative
    if (result.durationMs < 0) {
        violations.push({
            rule: 'duration-non-negative',
            severity: 'warning',
            message: `Execution duration is negative (${result.durationMs}ms) — clock skew?`,
            path: 'durationMs',
            context: { actual: result.durationMs },
        });
    }
    // Soft constraint: hash must be present
    if (!result.hash || result.hash.trim() === '') {
        violations.push({
            rule: 'hash-present',
            severity: 'warning',
            message: 'Result hash is missing — determinism checks will fail',
            path: 'hash',
        });
    }
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
        throw new ValidationError(`Algorithm "${result.algorithm}" produced invalid model: ${errors.map((e) => e.rule).join(', ')}`, result.algorithm, violations);
    }
}
//# sourceMappingURL=validation.js.map