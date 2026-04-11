/**
 * Error System - PRD §14
 * Schema version 1.0
 *
 * Provides typed, structured error handling with remediation guidance.
 * TypedError uses numeric codes 0-255 for compact serialization.
 * ErrorCode string aliases remain for human-readable usage.
 */
/**
 * Standardized error codes covering all failure modes
 */
export type ErrorCode = 'CONFIG_INVALID' | 'CONFIG_MISSING' | 'SOURCE_NOT_FOUND' | 'SOURCE_INVALID' | 'SOURCE_PERMISSION' | 'ALGORITHM_FAILED' | 'ALGORITHM_NOT_FOUND' | 'CONFORMANCE_FAILED' | 'SIMULATION_FAILED' | 'PREDICTION_FAILED' | 'VALIDATION_FAILED' | 'IMPORT_FAILED' | 'WASM_INIT_FAILED' | 'WASM_MEMORY_EXCEEDED' | 'SINK_FAILED' | 'SINK_PERMISSION' | 'OTEL_FAILED';
/**
 * TypedError — compact error type with numeric code (0-255)
 * for wire format, hashing, and cross-language interop.
 */
export interface TypedError {
    /** Schema version */
    schema_version: '1.0';
    /** Numeric error code (0-255) */
    code: number;
    /** Human-readable error message */
    message: string;
    /** Actionable remediation hint */
    remediation: string;
    /** Additional structured context */
    context: Record<string, unknown>;
}
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
/**
 * Structured error information with context and remediation
 */
export interface ErrorInfo {
    /** Standardized error code */
    code: ErrorCode;
    /** Human-readable error message */
    message: string;
    /** Additional context about the error */
    context?: Record<string, any>;
    /** How to fix this error */
    remediation: string;
    /** Process exit code (per PRD §8) */
    exit_code: number;
    /** Whether the error is recoverable */
    recoverable: boolean;
}
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
 * const error = createError('CONFIG_MISSING', 'pictl.toml not found in /path/to/project');
 * console.error(formatError(error)); // Human-readable output
 * process.exit(error.exit_code);    // Proper exit code
 * ```
 */
export declare function createError(code: ErrorCode, message: string, context?: Record<string, any>): ErrorInfo;
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
export declare function formatErrorJSON(error: ErrorInfo): Record<string, any>;
/**
 * Log error with appropriate level based on severity
 * Handles both console and structured logging (JSON for observability)
 *
 * @param error - ErrorInfo to log
 * @param format - Output format: 'human' (colored), 'plain' (no colors), or 'json'
 *
 * @example
 * ```ts
 * const error = createError('CONFIG_INVALID', 'Invalid syntax in pictl.toml');
 * logError(error, 'human');    // Colored terminal output
 * logError(error, 'json');     // JSON for structured logging
 * ```
 */
export declare function logError(error: ErrorInfo, format?: 'human' | 'plain' | 'json'): void;
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