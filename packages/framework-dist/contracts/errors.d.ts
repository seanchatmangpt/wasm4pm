/**
 * Error System - PRD §14
 * Schema version 1.0
 *
 * Provides typed, structured error handling with remediation guidance.
 * TypedError uses numeric codes 0-255 for compact serialization.
 * ErrorCode string aliases remain for human-readable usage.
 */
import { z } from 'zod';
export declare const ErrorCodeSchema: z.ZodEnum<["CONFIG_INVALID", "CONFIG_MISSING", "SOURCE_NOT_FOUND", "SOURCE_INVALID", "SOURCE_PERMISSION", "ALGORITHM_FAILED", "ALGORITHM_NOT_FOUND", "CONFORMANCE_FAILED", "SIMULATION_FAILED", "PREDICTION_FAILED", "VALIDATION_FAILED", "IMPORT_FAILED", "WASM_INIT_FAILED", "WASM_MEMORY_EXCEEDED", "SINK_FAILED", "SINK_PERMISSION", "OTEL_FAILED"]>;
/**
 * Standardized error codes covering all failure modes
 */
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export declare const TypedErrorSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"1.0">;
    code: z.ZodNumber;
    message: z.ZodString;
    remediation: z.ZodString;
    context: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    code: number;
    message: string;
    schema_version: "1.0";
    remediation: string;
    context: Record<string, unknown>;
}, {
    code: number;
    message: string;
    schema_version: "1.0";
    remediation: string;
    context: Record<string, unknown>;
}>;
/**
 * TypedError — compact error type with numeric code (0-255)
 * for wire format, hashing, and cross-language interop.
 */
export type TypedError = z.infer<typeof TypedErrorSchema>;
/**
 * Numeric code mapping (0-255 range) for TypedError
 */
export declare const TYPED_ERROR_CODES: Record<ErrorCode, number>;
/**
 * Reverse mapping: numeric code → ErrorCode string
 */
export declare const TYPED_ERROR_NAMES: Record<number, ErrorCode>;
/**
 * Create a TypedError from an ErrorCode string
 */
export declare function createTypedError(code: ErrorCode, message: string, context?: Record<string, unknown>): TypedError;
/**
 * Resolve a TypedError's numeric code back to its ErrorCode string
 */
export declare function resolveErrorCode(typedError: TypedError): ErrorCode | undefined;
/**
 * Type guard for TypedError
 */
export declare function isTypedError(value: unknown): value is TypedError;
/**
 * JSON Schema for TypedError (for external validation)
 */
export declare const TYPED_ERROR_JSON_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://wasm4pm.dev/schemas/typed-error/1.0";
    readonly title: "TypedError";
    readonly description: "Compact typed error with numeric code (0-255)";
    readonly type: "object";
    readonly required: readonly ["schema_version", "code", "message", "remediation", "context"];
    readonly properties: {
        readonly schema_version: {
            readonly type: "string";
            readonly const: "1.0";
        };
        readonly code: {
            readonly type: "integer";
            readonly minimum: 0;
            readonly maximum: 255;
        };
        readonly message: {
            readonly type: "string";
        };
        readonly remediation: {
            readonly type: "string";
        };
        readonly context: {
            readonly type: "object";
        };
    };
    readonly additionalProperties: false;
};
export declare const ErrorInfoSchema: z.ZodObject<{
    code: z.ZodEnum<["CONFIG_INVALID", "CONFIG_MISSING", "SOURCE_NOT_FOUND", "SOURCE_INVALID", "SOURCE_PERMISSION", "ALGORITHM_FAILED", "ALGORITHM_NOT_FOUND", "CONFORMANCE_FAILED", "SIMULATION_FAILED", "PREDICTION_FAILED", "VALIDATION_FAILED", "IMPORT_FAILED", "WASM_INIT_FAILED", "WASM_MEMORY_EXCEEDED", "SINK_FAILED", "SINK_PERMISSION", "OTEL_FAILED"]>;
    message: z.ZodString;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    remediation: z.ZodString;
    exit_code: z.ZodNumber;
    recoverable: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    code: "CONFIG_INVALID" | "CONFIG_MISSING" | "SOURCE_NOT_FOUND" | "SOURCE_INVALID" | "SOURCE_PERMISSION" | "ALGORITHM_FAILED" | "ALGORITHM_NOT_FOUND" | "CONFORMANCE_FAILED" | "SIMULATION_FAILED" | "PREDICTION_FAILED" | "VALIDATION_FAILED" | "IMPORT_FAILED" | "WASM_INIT_FAILED" | "WASM_MEMORY_EXCEEDED" | "SINK_FAILED" | "SINK_PERMISSION" | "OTEL_FAILED";
    message: string;
    remediation: string;
    exit_code: number;
    recoverable: boolean;
    context?: Record<string, unknown> | undefined;
}, {
    code: "CONFIG_INVALID" | "CONFIG_MISSING" | "SOURCE_NOT_FOUND" | "SOURCE_INVALID" | "SOURCE_PERMISSION" | "ALGORITHM_FAILED" | "ALGORITHM_NOT_FOUND" | "CONFORMANCE_FAILED" | "SIMULATION_FAILED" | "PREDICTION_FAILED" | "VALIDATION_FAILED" | "IMPORT_FAILED" | "WASM_INIT_FAILED" | "WASM_MEMORY_EXCEEDED" | "SINK_FAILED" | "SINK_PERMISSION" | "OTEL_FAILED";
    message: string;
    remediation: string;
    exit_code: number;
    recoverable: boolean;
    context?: Record<string, unknown> | undefined;
}>;
/**
 * Structured error information with context and remediation
 */
export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;
/**
 * Factory function to create structured errors
 * Ensures all errors have required fields and follow consistent format
 *
 * @param code - Standardized error code
 * @param message - Human-readable error message
 * @param context - Optional additional context (stack trace, values, etc.)
 * @returns Fully structured ErrorInfo object
 *
 * @example
 * ```ts
 * const error = createError('CONFIG_MISSING', 'wasm4pm.toml not found in /path/to/project');
 * console.error(formatError(error)); // Human-readable output
 * process.exit(error.exit_code);    // Proper exit code
 * ```
 */
export declare function createError(code: ErrorCode, message: string, context?: Record<string, unknown>): ErrorInfo;
/**
 * Format error for human-readable console output with colors
 * Includes error code, message, context (if present), and remediation
 *
 * @param error - ErrorInfo object to format
 * @param colorize - Whether to include ANSI color codes (disable for JSON/log files)
 * @returns Formatted string suitable for console.error()
 *
 * @example
 * ```ts
 * const error = createError('SOURCE_NOT_FOUND', 'Input file missing');
 * console.error(formatError(error));
 * // Output:
 * // ERROR [SOURCE_NOT_FOUND]: Input file missing
 * // Remediation: Verify the source path exists and is readable...
 * ```
 */
export declare function formatError(error: ErrorInfo, colorize?: boolean): string;
/**
 * Format error for JSON output
 * Includes all ErrorInfo fields plus formatting details
 *
 * @param error - ErrorInfo object to format
 * @returns JSON-serializable object
 *
 * @example
 * ```ts
 * const error = createError('WASM_MEMORY_EXCEEDED', 'Out of memory');
 * console.log(JSON.stringify(formatErrorJSON(error), null, 2));
 * // {
 * //   "code": "WASM_MEMORY_EXCEEDED",
 * //   "message": "Out of memory",
 * //   "remediation": "...",
 * //   "exit_code": 501,
 * //   "recoverable": true
 * // }
 * ```
 */
export declare function formatErrorJSON(error: ErrorInfo): Record<string, unknown>;
/**
 * Log error with appropriate level based on severity
 * Handles both console and structured logging (JSON for observability)
 *
 * @param error - ErrorInfo to log
 * @param format - Output format: 'human' (colored), 'plain' (no colors), or 'json'
 *
 * @example
 * ```ts
 * const error = createError('CONFIG_INVALID', 'Invalid syntax in wasm4pm.toml');
 * logError(error, 'human');    // Colored terminal output
 * logError(error, 'json');     // JSON for structured logging
 * ```
 */
export declare function logError(error: ErrorInfo, format?: 'human' | 'plain' | 'json'): void;
/**
 * ProcessMiningErrors — semantic factory functions for the most common
 * process-mining failure modes.
 *
 * Each factory produces an `ErrorInfo` with the correct error code, a
 * context-specific message, and a pre-populated `context` record.  They are
 * `as const` so callers can import `ProcessMiningErrors` and get tree-shaking
 * while still having the full shape visible to TypeScript.
 *
 * Exit codes follow the convention defined in `EXIT_CODES`:
 * - 300-series: source / input errors
 * - 400-series: algorithm errors
 * - 500-series: WASM runtime errors
 *
 * @example
 * ```ts
 * throw new Error(formatError(ProcessMiningErrors.invalidXes('unexpected EOF at line 42')));
 * ```
 */
export declare const ProcessMiningErrors: {
    /**
     * Invalid XES event log — source could not be parsed.
     * Exit code: 301 (SOURCE_INVALID)
     */
    readonly invalidXes: (detail: string) => ErrorInfo;
    /**
     * Discovery / analysis algorithm failed during execution.
     * Exit code: 400 (ALGORITHM_FAILED)
     */
    readonly algorithmFailed: (algo: string, reason: string) => ErrorInfo;
    /**
     * WASM module could not be initialised.
     * Exit code: 500 (WASM_INIT_FAILED)
     */
    readonly wasmLoadFailed: (reason: string) => ErrorInfo;
    /**
     * Conformance checking did not reach the required fitness threshold.
     * Exit code: 450 (CONFORMANCE_FAILED)
     */
    readonly conformanceFailed: (fitness: number, threshold: number) => ErrorInfo;
    /**
     * Source file or URL not found.
     * Exit code: 300 (SOURCE_NOT_FOUND)
     */
    readonly sourceNotFound: (path: string) => ErrorInfo;
    /**
     * Requested algorithm does not exist in the kernel registry.
     * Exit code: 401 (ALGORITHM_NOT_FOUND)
     */
    readonly algorithmNotFound: (algo: string) => ErrorInfo;
};
/**
 * Validate that all error codes have remediation and exit code mappings
 * Use this in tests to ensure completeness
 *
 * @returns Array of validation errors (empty if valid)
 *
 * @example
 * ```ts
 * const issues = validateErrorSystem();
 * if (issues.length > 0) {
 *   console.error('Error system validation failed:', issues);
 * }
 * ```
 */
export declare function validateErrorSystem(): string[];
//# sourceMappingURL=errors.d.ts.map