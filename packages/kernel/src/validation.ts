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
import { validateWasmPayload } from './zod-validators.js';

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
export class ValidationError extends Error {
  readonly violations: ViolationReport[];
  readonly algorithmName: string;

  constructor(message: string, algorithmName: string, violations: ViolationReport[]) {
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
export function validateKernelResult(
  result: KernelResult,
  metadata: AlgorithmMetadata
): void {
  const violations: ViolationReport[] = [];

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

  // Validate the raw WASM payload against the algorithm's registered Zod schema.
  // This is the insertion point for safeParse: it runs after envelope checks
  // so we only reach here when handle/type/duration/hash are sane.
  const payload = (result as any).metadata?.result;
  if (payload !== undefined) {
    try {
      validateWasmPayload(result.algorithm, payload);
    } catch (err) {
      violations.push({
        rule: 'wasm-payload-schema',
        severity: 'error',
        message: (err as Error).message,
        path: 'metadata.result',
        context: { algorithm: result.algorithm },
      });
    }
  }

  const errors = violations.filter((v) => v.severity === 'error');
  if (errors.length > 0) {
    throw new ValidationError(
      `Algorithm "${result.algorithm}" produced invalid model: ${errors.map((e) => e.rule).join(', ')}`,
      result.algorithm,
      violations
    );
  }
}
