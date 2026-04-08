/**
 * errors.ts
 * Rust → TypeScript error propagation
 *
 * Bridges raw WASM errors from wasm4pm into the contracts TypedError system.
 * Provides classification, context enrichment, and recovery guidance.
 */

import type { ErrorCode, TypedError } from '@pictl/contracts';
import { createTypedError, TYPED_ERROR_CODES } from '@pictl/contracts';

/** Kernel-specific error codes extending the contracts error system */
export type KernelErrorCode = ErrorCode | 'KERNEL_VERSION_MISMATCH' | 'KERNEL_NOT_INITIALIZED';

/**
 * KernelError — extends Error with structured context for kernel operations
 */
export class KernelError extends Error {
  readonly code: KernelErrorCode;
  readonly context: Record<string, unknown>;
  readonly recoverable: boolean;
  readonly timestamp: Date;

  readonly cause: Error | undefined;

  constructor(
    message: string,
    code: KernelErrorCode,
    options?: {
      cause?: Error;
      context?: Record<string, unknown>;
      recoverable?: boolean;
    }
  ) {
    super(message);
    this.name = 'KernelError';
    this.code = code;
    this.cause = options?.cause;
    this.context = options?.context ?? {};
    this.recoverable = options?.recoverable ?? false;
    this.timestamp = new Date();
    Object.setPrototypeOf(this, KernelError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      recoverable: this.recoverable,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * Type guard for KernelError
 */
export function isKernelError(err: unknown): err is KernelError {
  return err instanceof KernelError;
}

/**
 * Classify a raw WASM error string into a contracts ErrorCode
 * Maps common Rust panic/error patterns to structured codes
 *
 * @param raw - Raw error string from WASM
 * @returns Classified ErrorCode
 */
export function classifyRustError(raw: string): ErrorCode {
  if (!raw || typeof raw !== 'string') return 'ALGORITHM_FAILED';

  const lower = raw.toLowerCase();

  // Handle not found — Rust state::get returns "Handle not found: ..."
  if (lower.includes('not found') || lower.includes('no such')) {
    return 'ALGORITHM_FAILED';
  }

  // Type mismatch — "Object X is not an EventLog"
  if (lower.includes('is not a') || lower.includes('is not an') || lower.includes('type mismatch')) {
    return 'ALGORITHM_FAILED';
  }

  // Memory exceeded — "memory access out of bounds", "alloc failed"
  if (lower.includes('out of bounds') || lower.includes('alloc') || lower.includes('memory')) {
    return 'WASM_MEMORY_EXCEEDED';
  }

  // Init failures — "not initialized", "wasm module not loaded"
  if (lower.includes('not initialized') || lower.includes('module not loaded')) {
    return 'WASM_INIT_FAILED';
  }

  // Parse failures — "invalid json", "failed to parse"
  if (lower.includes('invalid json') || lower.includes('failed to parse') || lower.includes('parse error')) {
    return 'SOURCE_INVALID';
  }

  // Default: algorithm failure
  return 'ALGORITHM_FAILED';
}

/**
 * Convert a raw WASM error into a contracts TypedError
 *
 * @param raw - Raw error (string or Error)
 * @param algorithmId - Algorithm that was running when the error occurred
 * @returns Structured TypedError
 */
export function toTypedError(
  raw: unknown,
  algorithmId?: string
): TypedError {
  const message = raw instanceof Error ? raw.message : String(raw);
  const code = classifyRustError(message);

  return createTypedError(code, message, {
    ...(algorithmId ? { algorithm: algorithmId } : {}),
    source: 'wasm4pm-kernel',
  });
}

/**
 * Wrap a WASM function call with kernel error handling
 * Converts raw errors to KernelError with classification
 *
 * @param fn - Async function that calls WASM
 * @param context - Error context (algorithm name, step, etc.)
 * @returns Result of the function call
 * @throws KernelError with classified code and context
 */
export async function wrapKernelCall<T>(
  fn: () => Promise<T>,
  context?: { algorithm?: string; step?: string }
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = classifyRustError(message);

    throw new KernelError(message, code, {
      cause: err instanceof Error ? err : undefined,
      context: {
        ...(context?.algorithm ? { algorithm: context.algorithm } : {}),
        ...(context?.step ? { step: context.step } : {}),
      },
      recoverable: code === 'ALGORITHM_FAILED' || code === 'WASM_MEMORY_EXCEEDED',
    });
  }
}
