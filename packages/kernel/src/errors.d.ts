/**
 * errors.ts
 * Rust → TypeScript error propagation
 *
 * Bridges raw WASM errors from wasm4pm into the contracts TypedError system.
 * Provides classification, context enrichment, and recovery guidance.
 */
import type { ErrorCode, TypedError } from '@wasm4pm/contracts';
/** Kernel-specific error codes extending the contracts error system */
export type KernelErrorCode = ErrorCode | 'KERNEL_VERSION_MISMATCH' | 'KERNEL_NOT_INITIALIZED';
/**
 * KernelError — extends Error with structured context for kernel operations
 */
export declare class KernelError extends Error {
    readonly code: KernelErrorCode;
    readonly context: Record<string, unknown>;
    readonly recoverable: boolean;
    readonly timestamp: Date;
    readonly cause: Error | undefined;
    constructor(message: string, code: KernelErrorCode, options?: {
        cause?: Error;
        context?: Record<string, unknown>;
        recoverable?: boolean;
    });
    toJSON(): Record<string, unknown>;
}
/**
 * Type guard for KernelError
 */
export declare function isKernelError(err: unknown): err is KernelError;
/**
 * Classify a raw WASM error string into a contracts ErrorCode
 * Maps common Rust panic/error patterns to structured codes
 *
 * @param raw - Raw error string from WASM
 * @returns Classified ErrorCode
 */
export declare function classifyRustError(raw: string): ErrorCode;
/**
 * Convert a raw WASM error into a contracts TypedError
 *
 * @param raw - Raw error (string or Error)
 * @param algorithmId - Algorithm that was running when the error occurred
 * @returns Structured TypedError
 */
export declare function toTypedError(raw: unknown, algorithmId?: string): TypedError;
/**
 * Wrap a WASM function call with kernel error handling
 * Converts raw errors to KernelError with classification
 *
 * @param fn - Async function that calls WASM
 * @param context - Error context (algorithm name, step, etc.)
 * @returns Result of the function call
 * @throws KernelError with classified code and context
 */
export declare function wrapKernelCall<T>(fn: () => Promise<T>, context?: {
    algorithm?: string;
    step?: string;
}): Promise<T>;
//# sourceMappingURL=errors.d.ts.map